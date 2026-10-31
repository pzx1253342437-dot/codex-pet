const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { normalizeBilibiliCookie, writeBilibiliCookie } = require('../src/bili-cookie.cjs');

test('Cookie 整段粘贴时保留字段', () => {
  const value = 'Cookie: SESSDATA=abc; bili_jct=def; DedeUserID=1';
  assert.equal(normalizeBilibiliCookie(value), 'SESSDATA=abc; bili_jct=def; DedeUserID=1');
});

test('只贴 SESSDATA 的值也能识别', () => {
  assert.equal(normalizeBilibiliCookie('abc123'), 'SESSDATA=abc123');
});

test('没有 SESSDATA 时拒绝', () => {
  assert.equal(normalizeBilibiliCookie('bili_jct=def'), '');
  assert.equal(normalizeBilibiliCookie(''), '');
});

test('写回 .env 只替换 Cookie 行', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-pet-cookie-'));
  const file = path.join(dir, '.env');
  fs.writeFileSync(file, 'DEEPSEEK_API_KEY=key\nBILIBILI_COOKIE=old\n', 'utf8');
  writeBilibiliCookie(file, 'SESSDATA=new; bili_jct=x');
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /DEEPSEEK_API_KEY=key/);
  assert.match(text, /BILIBILI_COOKIE=SESSDATA=new; bili_jct=x/);
  assert.doesNotMatch(text, /old/);
  fs.rmSync(dir, { recursive: true, force: true });
});
