const fs = require('fs');

function normalizeBilibiliCookie(value) {
  let cookie = String(value || '').trim().replace(/^cookie\s*:\s*/i, '');
  cookie = cookie.replace(/[\r\n]+/g, '; ').replace(/;\s+/g, '; ').trim();
  if (!cookie) return '';
  if (!cookie.includes('=')) cookie = 'SESSDATA=' + cookie;
  if (!/(^|;\s*)SESSDATA=/.test(cookie)) return '';
  return cookie;
}

function writeBilibiliCookie(file, cookie) {
  const line = 'BILIBILI_COOKIE=' + cookie;
  let lines = [];
  if (fs.existsSync(file)) {
    lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  }
  let replaced = false;
  lines = lines.map((item) => {
    if (/^\s*BILIBILI_COOKIE\s*=/.test(item)) {
      replaced = true;
      return line;
    }
    return item;
  });
  if (!replaced) {
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (lines.length) lines.push('');
    lines.push(line);
  }
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
}

module.exports = {
  normalizeBilibiliCookie,
  writeBilibiliCookie
};
