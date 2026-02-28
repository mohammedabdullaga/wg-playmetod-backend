const assert = require('assert');
const subSvc = require('./subscriptionService');

(async () => {
  // unknown token should return null
  const none = await subSvc.getSubscription('nonexistent');
  assert.strictEqual(none, null);

  // generate config manually via helper object to ensure no leading comment
  const fake = {
    id: 1,
    email: 'a@b.c',
    phone: '',
    expires_at: new Date().toISOString(),
    status: 'active',
    access_token: 'tok',
    peer_id: 2,
    public_key: 'PUBKEY',
    private_key: 'PRIVKEY',
    ip_address: '10.0.0.5',
  };
  // monkeypatch private function
  const orig = subSvc._getByToken;
  subSvc._getByToken = () => fake;
  const cfg = await subSvc.getSubscriptionConfig('tok');
  assert(cfg.startsWith('[Interface]'), 'config should start with interface block');
  assert(!cfg.startsWith('#'), 'config should not start with a comment');
  // restore
  subSvc._getByToken = orig;

  // QR generation should use config text
  subSvc._getByToken = () => fake;
  const qrbuf = await subSvc.getSubscriptionQr('tok');
  assert(qrbuf && qrbuf.length > 0, 'qr buffer should be returned');
  subSvc._getByToken = orig;

  console.log('subscriptionService basic tests passed');
})();
