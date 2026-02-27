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
  return new Promise((resolve, reject) => {
    const wg = spawn('wg', ['syncconf', settings.wg_interface, tmpPath]);
    wg.on('error', (err) => {
      fs.unlinkSync(tmpPath);
      reject(err);
    });
    wg.on('close', (code) => {
      fs.unlinkSync(tmpPath);
      if (code !== 0) return reject(new Error('wg syncconf exited ' + code));
      resolve();
    });
  });
}

function getWireGuardStatus() {
  return new Promise((resolve, reject) => {
    const wg = spawn('wg', ['show', 'all']);
    let out = '';
    wg.stdout.on('data', (d) => { out += d.toString(); });
    wg.on('error', reject);
    wg.on('close', (code) => {
      if (code !== 0) return reject(new Error('wg show failed')); 
      resolve(out);
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
