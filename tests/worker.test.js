import assert from 'assert';
import worker from '../src/worker.js';

class FakeKVNamespace {
  constructor(seed = {}) {
    this.store = new Map(Object.entries(seed));
  }

  async get(key, type) {
    const value = this.store.get(key);
    if (value === undefined) {
      return null;
    }

    if (type === 'json') {
      return JSON.parse(value);
    }

    return value;
  }

  async put(key, value) {
    this.store.set(key, value);
  }
}

function createEnv(overrides = {}) {
  const manifest = {
    skillSlug: 'zhangxuefeng-perspective',
    skillDirLabel: 'skills/zhangxuefeng-perspective',
    directories: {
      '.': [
        { name: 'README.md', type: 'file', path: 'README.md' },
        { name: 'SKILL.md', type: 'file', path: 'SKILL.md' },
        { name: 'references', type: 'dir', path: 'references' },
      ],
      references: [
        { name: 'research', type: 'dir', path: 'references/research' },
      ],
      'references/research': [
        { name: '01-writings.md', type: 'file', path: 'references/research/01-writings.md' },
      ],
    },
    files: {
      'SKILL.md': { name: 'SKILL.md', path: 'SKILL.md', size: 120, text: true },
      'README.md': { name: 'README.md', path: 'README.md', size: 40, text: true },
      'references/research/01-writings.md': {
        name: '01-writings.md',
        path: 'references/research/01-writings.md',
        size: 24,
        text: true,
      },
    },
  };

  return {
    AUTH_PASSWORD: 'test-password',
    SKILL_SLUG: 'zhangxuefeng-perspective',
    APP_KV: new FakeKVNamespace({
      'skill:zhangxuefeng-perspective:manifest': JSON.stringify(manifest),
      'skill:zhangxuefeng-perspective:file:SKILL.md': `---
name: zhangxuefeng-perspective
description: 张雪峰的思维框架与表达方式
---
技能正文`,
      'skill:zhangxuefeng-perspective:file:README.md': '# README',
      'skill:zhangxuefeng-perspective:file:references/research/01-writings.md': '# 调研',
    }),
    ASSETS: {
      fetch() {
        return new Response('asset', { status: 200 });
      },
    },
    ...overrides,
  };
}

async function request(path, init = {}, env = createEnv()) {
  return worker.fetch(new Request(`https://example.com${path}`, init), env);
}

async function testHealth() {
  const res = await request('/health');
  const data = await res.json();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.status, 'ok');
}

async function testAuthStatus() {
  const res = await request('/api/auth/status');
  const data = await res.json();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.required, true);
}

async function testAuthVerify() {
  const successRes = await request('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'test-password' }),
  });
  const successData = await successRes.json();
  assert.strictEqual(successRes.status, 200);
  assert.strictEqual(successData.success, true);

  const failureRes = await request('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'wrong' }),
  });
  const failureData = await failureRes.json();
  assert.strictEqual(failureRes.status, 401);
  assert.strictEqual(failureData.success, false);
}

async function testSkillInfo() {
  const res = await request('/api/skill/info');
  const data = await res.json();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.skill.name, 'zhangxuefeng-perspective');
  assert.ok(Array.isArray(data.skill.tools));
}

async function testLimitStatus() {
  const res = await request('/api/limit/status');
  const data = await res.json();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.maxLength, 300);
  assert.strictEqual(data.rateLimit.limit, 5);
}

async function testChatValidation() {
  const missingRes = await request('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.strictEqual(missingRes.status, 400);

  const tooLongRes = await request('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'x'.repeat(301) }),
  });
  assert.strictEqual(tooLongRes.status, 400);
}

async function testChatResetAndReload() {
  const resetRes = await request('/api/chat/reset', { method: 'POST' });
  const resetData = await resetRes.json();
  assert.strictEqual(resetRes.status, 200);
  assert.strictEqual(resetData.success, true);

  const reloadRes = await request('/api/reload', { method: 'POST' });
  const reloadData = await reloadRes.json();
  assert.strictEqual(reloadRes.status, 200);
  assert.strictEqual(reloadData.success, true);
}

async function runTests() {
  await testHealth();
  await testAuthStatus();
  await testAuthVerify();
  await testSkillInfo();
  await testLimitStatus();
  await testChatValidation();
  await testChatResetAndReload();
  console.log('worker tests passed');
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
