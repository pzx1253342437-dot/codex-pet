const { trimSentence } = require('./local-summary.cjs');

function getAiConfig() {
  if (process.env.AI_API_KEY) {
    return {
      name: process.env.AI_PROVIDER || 'ai',
      apiKey: process.env.AI_API_KEY,
      baseUrl: (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
      model: process.env.AI_MODEL || 'gpt-4o-mini'
    };
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return {
      name: 'deepseek',
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, ''),
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat'
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      name: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
    };
  }
  return null;
}

function parseJsonContent(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeList(value, limit) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => trimSentence(String(item || ''), 220))
    .filter(Boolean)
    .slice(0, limit || 6);
}

async function summarizeWithAi(input) {
  const config = getAiConfig();
  if (!config) return null;

  const title = String(input.title || '').trim();
  const url = String(input.url || '').trim();
  const isVideo = Boolean(input.isVideo);
  const text = String(input.text || '').slice(0, 30000);
  if (text.length < 80) return null;

  const longPrompt = isVideo
    ? '这是视频内容，longSummary 要按内容顺序写四到八段，覆盖开头、主要观点、例子和结尾。'
    : '这是网页内容，longSummary 写四到六段，按原文逻辑展开。';

  const systemPrompt = [
    '你是内容摘要助手。只根据用户给出的正文写摘要，不补充正文没有的信息。',
    '输出必须是 JSON，不要用 Markdown 代码块。',
    '字段固定为 tldr、bullets、longSummary、keyPoints。',
    'tldr 用一到两句话概括主要内容。',
    'bullets 是四到六条关键信息，每条尽量短。',
    'keyPoints 是三条最值得记住的短句。',
    longPrompt,
    '如果正文明显不完整，在 longSummary 末尾直接写明缺了哪些信息，不要自行猜测。'
  ].join('\n');

  const userPrompt = [
    '标题：' + (title || '未命名'),
    '链接：' + url,
    '类型：' + (isVideo ? '视频' : '网页'),
    '',
    '正文：',
    text
  ].join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 70000);
  try {
    const response = await fetch(config.baseUrl + '/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.apiKey
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        max_tokens: 2200,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error('AI 服务返回 ' + response.status + (detail ? ' ' + detail.slice(0, 120) : ''));
    }
    const data = await response.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '';
    const parsed = parseJsonContent(content);
    if (!parsed) {
      return {
        tldr: trimSentence(content, 240) || '模型没有返回摘要。',
        bullets: [],
        longSummary: String(content || '').trim(),
        keyPoints: [],
        provider: config.name,
        warning: '模型没有返回结构化 JSON，已按原文展示。'
      };
    }
    return {
      tldr: trimSentence(parsed.tldr || parsed.summary || '', 260) || '模型没有给出简短的结论。',
      bullets: normalizeList(parsed.bullets, 6),
      longSummary: String(parsed.longSummary || parsed.long_summary || '').trim(),
      keyPoints: normalizeList(parsed.keyPoints || parsed.key_points, 3),
      provider: config.name
    };
  } catch (error) {
    if (error && error.name === 'AbortError') throw new Error('AI 摘要超时');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  getAiConfig,
  parseJsonContent,
  summarizeWithAi
};
