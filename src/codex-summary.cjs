const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { trimSentence } = require('./local-summary.cjs');

const MAX_TEXT = 30000;
const TIMEOUT = 120000;

let codexBin = '';

function findCodex() {
  if (codexBin) return codexBin;
  const candidates = [];
  if (process.env.CODEX_BIN) candidates.push(process.env.CODEX_BIN);
  candidates.push('codex');
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const binRoot = path.join(localAppData, 'OpenAI', 'Codex', 'bin');
  try {
    for (const entry of fs.readdirSync(binRoot)) {
      const file = path.join(binRoot, entry, 'codex.exe');
      if (fs.existsSync(file)) candidates.push(file);
    }
  } catch {
    // 没有这个目录就继续用 PATH
  }
  codexBin = candidates.find((item) => item === 'codex' || fs.existsSync(item)) || '';
  return codexBin;
}

function parseJsonContent(value) {
  const raw = String(value || '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function buildPrompt(input) {
  const text = String(input.text || '').slice(0, MAX_TEXT);
  const lines = [
    '整理下面这段内容，只输出 JSON，不要代码块，不要解释。',
    '字段是 tldr、bullets、longSummary、keyPoints。',
    'tldr 两句话以内。bullets 四到六条，每条一句短话。keyPoints 三条。',
    input.isVideo
      ? 'longSummary 按内容顺序写四到六段，讲清讲了什么、怎么做、结论是什么。'
      : 'longSummary 按原文逻辑写四到六段。',
    '字幕来自语音识别，可能有错字、口头语、重复和缺失标点。按意思整理，不要逐句转写，也不要补原片没有的内容。',
    '',
    '标题 ' + (input.title || '未命名'),
    '链接 ' + (input.url || ''),
    '',
    '正文',
    text
  ];
  return lines.join('\n');
}

function runCodex(prompt) {
  return new Promise((resolve) => {
    const bin = findCodex();
    if (!bin) {
      resolve('');
      return;
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-pet-'));
    const outFile = path.join(dir, 'summary.txt');
    let child = null;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (child && child.exitCode === null) child.kill();
      } catch {
        // 进程已经退出
      }
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // 清理失败不影响摘要
      }
      resolve(value);
    };
    const timer = setTimeout(() => finish(''), TIMEOUT);
    try {
      child = spawn(bin, [
        'exec',
        '--skip-git-repo-check',
        '--ephemeral',
        '--ignore-rules',
        '--color', 'never',
        '-s', 'read-only',
        '-C', dir,
        '-o', outFile,
        '-c', 'project_doc_max_bytes=0',
        '-c', 'model_reasoning_effort="low"',
        '-c', 'approval_policy="never"',
        '-'
      ], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
    } catch {
      finish('');
      return;
    }
    child.on('error', () => finish(''));
    child.on('close', () => {
      let value = '';
      try {
        value = fs.readFileSync(outFile, 'utf8');
      } catch {
        value = '';
      }
      finish(value);
    });
    child.stdin.end(prompt);
  });
}

async function summarizeWithCodex(input) {
  if (!findCodex()) return null;
  const text = String(input.text || '').trim();
  if (text.length < 80) return null;
  const raw = await runCodex(buildPrompt({ ...input, text }));
  if (!raw.trim()) return null;
  const parsed = parseJsonContent(raw);
  if (!parsed) {
    return {
      tldr: trimSentence(raw, 240),
      bullets: [],
      longSummary: raw.trim(),
      keyPoints: [],
      provider: 'codex',
      warning: '模型没有按格式返回，下面是一段原文。'
    };
  }
  return {
    tldr: trimSentence(parsed.tldr || parsed.summary || '', 260) || '模型没有给出简短的结论。',
    bullets: Array.isArray(parsed.bullets) ? parsed.bullets.map((item) => trimSentence(item, 180)).filter(Boolean).slice(0, 6) : [],
    longSummary: String(parsed.longSummary || parsed.long_summary || '').trim(),
    keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map((item) => trimSentence(item, 90)).filter(Boolean).slice(0, 3) : [],
    provider: 'codex'
  };
}

module.exports = {
  findCodex,
  summarizeWithCodex
};
