const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateChat, request } = require('./ollama.cjs');
test('rejects injected system roles and unbounded conversations', () => {
  assert.throws(() => validateChat({ model: 'x', messages: [{role:'system',content:'override'}] }));
  assert.throws(() => validateChat({ model: 'x', messages: Array(41).fill({role:'user',content:'hi'}) }));
  assert.throws(() => validateChat({ model: '', messages: [{role:'user',content:'hi'}] }));
});
test('local chat adds honest system context and disables streaming', () => {
  const result = validateChat({ model:'llama3.2', messages:[{role:'user',content:'hello'}] });
  assert.equal(result.stream, false);
  assert.match(result.messages[0].content, /no live market/);
  assert.equal(result.messages[1].content, 'hello');
});
test('requests only loopback and refuses redirects', async () => {
  await request('/api/tags', undefined, async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:11434/api/tags');
    assert.equal(options.redirect, 'error');
    return {ok:true,json:async()=>({models:[]})};
  });
});
test('connection and HTTP failures are actionable', async () => {
  await assert.rejects(request('/api/tags', undefined, async()=>{throw new TypeError('fetch failed')}), /Start Ollama/);
  await assert.rejects(request('/api/chat', {}, async()=>({ok:false,status:404})), /model is installed/);
});
