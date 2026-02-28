const assert = require('assert');
const { validateInterface, _peerBlocks } = require('./wgService');

// validateInterface
assert.strictEqual(validateInterface('wg0'), 'wg0');
assert.strictEqual(validateInterface('tun1'), 'tun1');

let threw = false;
try {
  validateInterface('bad/name');
} catch (e) {
  threw = true;
  assert.strictEqual(e.message, 'invalid interface name');
}
assert(threw, 'should throw on invalid iface');

threw = false;
try {
  validateInterface('');
} catch (e) {
  threw = true;
  assert.strictEqual(e.message, 'wg interface not specified');
}
assert(threw, 'should throw when none provided');

// peer blocks
const peers = [
  { enabled: 1, public_key: 'ABC', ip_address: '10.0.0.5' },
  { enabled: 0, public_key: 'DEF', ip_address: '10.0.0.6' },
  { enabled: 1, public_key: 'XYZ', ip_address: '10.0.0.7' },
];
const blocks = _peerBlocks(peers);
assert(blocks.includes('PublicKey = ABC'));
assert(!blocks.includes('DEF'));
assert(blocks.includes('PublicKey = XYZ'));

console.log('wgService helpers tests passed');
