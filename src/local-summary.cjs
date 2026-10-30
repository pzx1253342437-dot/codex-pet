const STOPWORDS = new Set((
  '的 了 和 是 在 我 有 就 不 人 都 一 一个 上 也 很 到 说 要 去 你 会 着 没有 看 好 自己 这 那 与 及 或 被 把 让 给 对 从 为 中 内 外 而 但 如果 因为 所以 可以 这个 那个 这些 那些 以及 还有 已经 正在 将 会 可能 目前 现在 今天 今年 进行 相关 表示 认为 需要 通过 对于 关于 根据 由于 但是 并且 我们 他们 你们 它 其 此 该 等 更 最 又 再 还 只 才 就 都 也 和 与 及 或 被 把 让 给 对 从 为 中 内 外'
).split(/\s+/));
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter
  ? new Intl.Segmenter('zh', { granularity: 'word' })
  : null;

function cleanText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitSentences(value) {
  const text = cleanText(value);
  if (!text) return [];
  const parts = text.match(/[^。！？.!?\n]+[。！？.!?]?/g) || [];
  return parts
    .map((item) => item.replace(/^[\s，,、；;：:.\-—–]+/, '').trim())
    .filter((item) => item.length > 0)
    .slice(0, 600);
}

function sentenceKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s，,。.!！?？、；;：:"'“”‘’（）()【】\[\]]/g, '');
}

function uniqueSentences(sentences) {
  const output = [];
  const keys = [];
  for (const sentence of sentences) {
    const key = sentenceKey(sentence);
    if (!key) continue;
    const index = keys.findIndex((existing) => {
      if (existing === key) return true;
      if (key.length < 8 || existing.length < 8) return false;
      return existing.includes(key) || key.includes(existing);
    });
    if (index >= 0) {
      if (keys[index].length < key.length) {
        keys[index] = key;
        output[index] = sentence;
      }
      continue;
    }
    keys.push(key);
    output.push(sentence);
  }
  return output;
}

function tokenize(value) {
  const text = String(value || '').toLowerCase();
  const tokens = [];
  if (segmenter) {
    for (const item of segmenter.segment(text)) {
      if (!item.isWordLike) continue;
      const token = item.segment.trim();
      if (!token || STOPWORDS.has(token)) continue;
      if (token.length < 2 && !/^[a-z0-9]$/.test(token)) continue;
      tokens.push(token);
    }
    return tokens;
  }
  const matches = text.match(/[a-z0-9]{2,}|[\u4e00-\u9fff]{2,4}/g) || [];
  return matches.filter((token) => !STOPWORDS.has(token));
}

function trimSentence(value, maxLength) {
  const text = String(value || '').trim();
  const limit = maxLength || 180;
  if (text.length <= limit) return text;
  return text.slice(0, limit - 1).replace(/[，,、；;：:\s]+$/, '') + '…';
}

function pickSentences(sentences, limit, title) {
  const frequencies = new Map();
  const sentenceTokens = [];
  for (const sentence of sentences) {
    const tokens = tokenize(sentence);
    sentenceTokens.push(tokens);
    for (const token of tokens) frequencies.set(token, (frequencies.get(token) || 0) + 1);
  }
  const titleTokens = new Set(tokenize(title || ''));
  const maxFrequency = Math.max(1, ...frequencies.values());
  const scored = sentences.map((sentence, index) => {
    const tokens = sentenceTokens[index];
    if (!tokens.length) return { sentence, index, score: 0 };
    let score = 0;
    for (const token of tokens) {
      score += (frequencies.get(token) || 0) / maxFrequency;
      if (titleTokens.has(token)) score += 0.8;
    }
    score = score / Math.sqrt(tokens.length + 2);
    if (index < 3) score += 1.1;
    if (index >= sentences.length - 2) score += 0.2;
    if (/[0-9]/.test(sentence)) score += 0.25;
    return { sentence, index, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence);
}

function summarizeLocally(input) {
  const title = cleanText(input && input.title);
  const description = cleanText(input && input.description);
  const text = cleanText(input && input.text);
  const isVideo = Boolean(input && input.isVideo);
  const source = [description, text].filter(Boolean).join('\n');
  const sentences = uniqueSentences(splitSentences(source).filter((sentence) => sentence.length > 8));

  if (!sentences.length) {
    const fallback = trimSentence(title || description || text || '没有拿到可读正文。', 220);
    return {
      tldr: fallback,
      bullets: [],
      longSummary: fallback,
      keyPoints: [],
      provider: 'local'
    };
  }

  const picked = pickSentences(sentences, isVideo ? 20 : 14, title);
  const tldr = trimSentence(picked.slice(0, 2).join(' '), 240) || trimSentence(sentences[0], 240);
  const bullets = picked
    .filter((sentence) => sentence !== picked[0])
    .slice(0, 5)
    .map((sentence) => trimSentence(sentence, 150));
  const longSummary = picked.map((sentence) => trimSentence(sentence, 260)).join('\n\n');
  const keyPoints = picked.slice(0, 3).map((sentence) => trimSentence(sentence, 80));

  return {
    tldr,
    bullets: bullets.length ? bullets : [trimSentence(picked[0], 150)],
    longSummary,
    keyPoints,
    provider: 'local'
  };
}

module.exports = {
  STOPWORDS,
  cleanText,
  splitSentences,
  sentenceKey,
  uniqueSentences,
  tokenize,
  trimSentence,
  pickSentences,
  summarizeLocally
};
