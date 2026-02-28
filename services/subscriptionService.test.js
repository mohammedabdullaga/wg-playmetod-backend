const assert = require('assert');
const subSvc = require('./subscriptionService');

(async () => {
  // unknown token should return null
  const none = await subSvc.getSubscription('nonexistent');
  assert.strictEqual(none, null);

  console.log('subscriptionService basic tests passed');
})();
