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

function _buildConfig(peers, settings) {
  let conf = `
[Interface]
Address = ${settings.subnet.split('/')[0]}
ListenPort = ${settings.server_port}
`;
  // note: the server private key should already be configured on the interface
  // or you can extend settings table to include it if desired
  peers.forEach(p => {
    if (!p.enabled) return;
    conf += `
[Peer]
PublicKey = ${p.public_key}
AllowedIPs = ${p.ip_address}/32
`;
  });
  return conf;
}

async function syncWireGuard() {
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  const peers = db.prepare('SELECT * FROM peers').all();
  const conf = _buildConfig(peers, settings);
  const tmpPath = path.join(os.tmpdir(), `wg-conf-${Date.now()}.conf`);
  fs.writeFileSync(tmpPath, conf);
  
  console.log(`[WG] Syncing interface: ${settings.wg_interface}`);
  console.log(`[WG] Config file: ${tmpPath}`);
  console.log(`[WG] Configuration:\n${conf}`);
  
  return new Promise((resolve, reject) => {
    const wg = spawn('wg', ['syncconf', settings.wg_interface, tmpPath]);
    let stderr = '';
    let stdout = '';
    
    wg.stdout.on('data', (d) => { stdout += d.toString(); });
    wg.stderr.on('data', (d) => { stderr += d.toString(); });
    
    wg.on('error', (err) => {
      fs.unlinkSync(tmpPath);
      console.error(`[WG] Spawn error:`, err.message);
      reject(err);
    });
    
    wg.on('close', (code) => {
      fs.unlinkSync(tmpPath);
      if (code !== 0) {
        console.error(`[WG] syncconf exited with code ${code}`);
        if (stderr) console.error(`[WG] stderr: ${stderr}`);
        if (stdout) console.error(`[WG] stdout: ${stdout}`);
        return reject(new Error(`wg syncconf exited ${code}: ${stderr || 'unknown error'}`));
      }
      console.log(`[WG] syncconf successful`);
      resolve();
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
  // read interface from settings and validate
  const settings = db.prepare('SELECT wg_interface FROM settings WHERE id = 1').get();
  let iface = (settings && settings.wg_interface) ? settings.wg_interface : 'wg0';
  // validate name
  if (!/^[a-zA-Z0-9_=+\-.]{1,15}$/.test(iface)) {
    throw new Error('invalid interface name');
  }
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
};
