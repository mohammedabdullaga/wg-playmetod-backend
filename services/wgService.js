const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const db = require('../database');

async function generatePeerKeys() {
  return new Promise((resolve, reject) => {
    // generate private key
    const gen = spawn('wg', ['genkey']);
    let priv = '';

    gen.stdout.on('data', (d) => { priv += d.toString(); });
    gen.on('error', reject);
    gen.on('close', (code) => {
      if (code !== 0) return reject(new Error('wg genkey failed'));
      priv = priv.trim();

      const pub = spawn('wg', ['pubkey']);
      let pubout = '';
      pub.stdin.write(priv + '\n');
      pub.stdin.end();
      pub.stdout.on('data', (d) => { pubout += d.toString(); });
      pub.on('error', reject);
      pub.on('close', (c2) => {
        if (c2 !== 0) return reject(new Error('wg pubkey failed'));
        resolve({ privateKey: priv, publicKey: pubout.trim() });
      });
    });
  });
}

// validate that the interface name is safe for use in filenames/commands
function validateInterface(iface) {
  if (!iface) throw new Error('wg interface not specified');
  // only allow simple alphanumeric/underscore names (no spaces, slashes, etc.)
  if (!/^[a-zA-Z0-9_]+$/.test(iface)) {
    throw new Error('invalid interface name');
  }
  return iface;
}

// build the peer block portion of a WireGuard config from DB rows
function _peerBlocks(peers) {
  return peers
    .filter(p => p.enabled)
    .map(p => `
[Peer]
PublicKey = ${p.public_key}
AllowedIPs = ${p.ip_address}/32
`)
    .join('');
}

async function syncWireGuard() {
  // read settings and validate interface name
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  const iface = validateInterface(settings && settings.wg_interface ? settings.wg_interface : 'wg0');
  const wgConfPath = `/etc/wireguard/${iface}.conf`;

  // read existing config and keep a backup in case we need to roll back
  let original;
  try {
    original = fs.readFileSync(wgConfPath, 'utf8');
  } catch (err) {
    throw new Error(`unable to read ${wgConfPath}: ${err.message}`);
  }

  // build new peer blocks from database
  const peers = db.prepare('SELECT * FROM peers').all();
  const blocks = _peerBlocks(peers);

  // remove any existing peer definitions from the original file
  const interfacePart = original.split(/\r?\n\[Peer\]/)[0];
  const newContent = (interfacePart.trimEnd() + '\n\n' + blocks.trim() + '\n').replace(/\n{3,}/g, '\n\n');

  const backupPath = path.join(os.tmpdir(), `${iface}-conf-backup-${Date.now()}.conf`);
  fs.writeFileSync(backupPath, original, { mode: 0o600 });

  // write updated configuration back to the live file
  fs.writeFileSync(wgConfPath, newContent, { mode: 0o600 });

  console.log(`[WG] wrote updated config to ${wgConfPath}`);
  console.log(`[WG] new configuration:\n${newContent}`);

  // now generate stripped configuration for syncconf
  const tmpPath = path.join(os.tmpdir(), `wg-strip-${Date.now()}.conf`);

  return new Promise((resolve, reject) => {
    const strip = spawn('wg-quick', ['strip', iface]);
    let stripOut = '';
    let stripErr = '';

    strip.stdout.on('data', (d) => { stripOut += d.toString(); });
    strip.stderr.on('data', (d) => { stripErr += d.toString(); });

    strip.on('close', (code) => {
      if (code !== 0) {
        // restore original config before rejecting
        fs.writeFileSync(wgConfPath, original, { mode: 0o600 });
        fs.unlinkSync(backupPath);
        console.error(`[WG] wg-quick strip failed (${code}): ${stripErr}`);
        return reject(new Error(`wg-quick strip failed: ${stripErr || stripOut}`));
      }
      fs.writeFileSync(tmpPath, stripOut, { mode: 0o600 });

      // perform syncconf using the stripped file
      const wg = spawn('wg', ['syncconf', iface, tmpPath]);
      let stderr = '';
      let stdout = '';

      wg.stdout.on('data', (d) => { stdout += d.toString(); });
      wg.stderr.on('data', (d) => { stderr += d.toString(); });

      wg.on('close', (code2) => {
        // cleanup stripped temp file
        try { fs.unlinkSync(tmpPath); } catch (e) {}

        if (code2 !== 0) {
          // rollback config file
          fs.writeFileSync(wgConfPath, original, { mode: 0o600 });
          fs.unlinkSync(backupPath);
          console.error(`[WG] syncconf failed (${code2}): ${stderr}`);
          return reject(new Error(`wg syncconf exited ${code2}: ${stderr || stdout}`));
        }

        // success, remove backup
        try { fs.unlinkSync(backupPath); } catch (e) {}
        console.log(`[WG] syncconf successful`);
        resolve();
      });

      wg.on('error', (err) => {
        try { fs.unlinkSync(tmpPath); } catch (e) {}
        fs.writeFileSync(wgConfPath, original, { mode: 0o600 });
        fs.unlinkSync(backupPath);
        reject(err);
      });
    });

    strip.on('error', (err) => {
      // restore and cleanup
      try { fs.writeFileSync(wgConfPath, original, { mode: 0o600 }); } catch (e) {}
      try { fs.unlinkSync(backupPath); } catch (e) {}
      reject(err);
    });
  });
}

// parse output of `wg show <iface> dump` into structured json
function _parseDump(output) {
  const lines = output.trim().split('\n');
  if (lines.length === 0) return null;
  const [ifaceLine, ...peerLines] = lines;
  const ifFields = ifaceLine.split('\t');
  const iface = {
    name: ifFields[0],
    publicKey: ifFields[1],
    listenPort: parseInt(ifFields[3], 10) || null,
    fwmark: ifFields[4] || null,
  };
  const peers = peerLines.map(l => {
    const f = l.split('\t');
    return {
      publicKey: f[1],
      endpoint: f[4] || null,
      allowedIps: f[5] ? f[5].split(',') : [],
      latestHandshakeEpoch: parseInt(f[6], 10) || 0,
      txBytes: parseInt(f[7], 10) || 0,
      rxBytes: parseInt(f[8], 10) || 0,
      persistentKeepalive: parseInt(f[9], 10) || 0,
    };
  });
  return { interface: iface, peers, generatedAt: new Date().toISOString() };
}

async function getWireGuardStatus() {
  const settings = db.prepare('SELECT wg_interface FROM settings WHERE id = 1').get();
  const iface = validateInterface(settings && settings.wg_interface ? settings.wg_interface : 'wg0');
  return new Promise((resolve, reject) => {
    const wg = spawn('wg', ['show', iface, 'dump']);
    let out = '';
    wg.stdout.on('data', (d) => { out += d.toString(); });
    wg.on('error', reject);
    wg.on('close', (code) => {
      if (code !== 0) return reject(new Error('wg show failed'));
      try {
        const parsed = _parseDump(out);
        if (!parsed) return reject(new Error('no output'));
        resolve(parsed);
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function importManualPeer(publicKey) {
  // validate length
  if (!/^[-A-Za-z0-9+/=]{44}$/.test(publicKey)) {
    throw new Error('invalid wg public key');
  }
  return { publicKey };
}

module.exports = {
  syncWireGuard,
  getWireGuardStatus,
  generatePeerKeys,
  importManualPeer,
  // helpers exported for unit testing
  validateInterface,
  _peerBlocks,
};
