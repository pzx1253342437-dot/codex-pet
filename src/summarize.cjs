const {
  normalizeUrl,
  extractPage,
  extractBilibiliPage,
  fetchText,
  getYouTubeId,
  isVideoUrl,
  isBilibiliUrl,
  fetchYouTubeTranscript,
  fetchYouTubeOEmbed,
  fetchBilibiliTranscript
} = require('./extract.cjs');
const { summarizeLocally, trimSentence } = require('./local-summary.cjs');
const { summarizeWithAi } = require('./ai-summary.cjs');

function hostOf(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (!total) return '';
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours) return hours + ':' + String(minutes).padStart(2, '0') + ':' + String(rest).padStart(2, '0');
  return minutes + ':' + String(rest).padStart(2, '0');
}

function buildVideoInfoSummary(extracted) {
  const facts = [];
  if (extracted.author) facts.push('作者 ' + extracted.author);
  const duration = formatDuration(extracted.duration);
  if (duration) facts.push('时长 ' + duration);
  if (extracted.tags && extracted.tags.length) facts.push('标签 ' + extracted.tags.slice(0, 6).join('、'));
  const description = String(extracted.description || '').trim();
  const lines = [description, ...facts].filter(Boolean);
  const tldr = description
    ? trimSentence(description, 220)
    : '视频页面没有提供可读字幕，这里只整理页面能读到的信息。';
  return {
    tldr,
    bullets: facts.slice(0, 4),
    longSummary: lines.join('\n\n'),
    keyPoints: facts.slice(0, 3),
    provider: 'local'
  };
}

async function summarizeUrl(input) {
  const url = normalizeUrl(input);
  const youtubeId = getYouTubeId(url);
  let page = null;
  let pageError = null;

  try {
    page = await fetchText(url);
  } catch (error) {
    pageError = error;
  }

  const bilibili = page && (isBilibiliUrl(url) || isBilibiliUrl(page.finalUrl))
    ? extractBilibiliPage(page.body, page.finalUrl)
    : null;
  const extracted = bilibili || (page
    ? extractPage(page.body, page.finalUrl)
    : {
        title: '',
        description: '',
        siteName: '',
        author: '',
        publishedAt: '',
        type: '',
        image: '',
        canonical: '',
        text: ''
      });

  let transcript = null;
  if (youtubeId) {
    try {
      transcript = await fetchYouTubeTranscript(youtubeId);
    } catch {
      transcript = null;
    }
  }
  if (bilibili) {
    transcript = await fetchBilibiliTranscript(bilibili);
  }

  if (!extracted.title && youtubeId) {
    const oembed = await fetchYouTubeOEmbed(youtubeId);
    if (oembed) {
      extracted.title = oembed.title || extracted.title;
      extracted.author = oembed.author_name || extracted.author;
      extracted.siteName = 'YouTube';
    }
  }

  const isVideo = Boolean(youtubeId) || isVideoUrl(url) || /video/i.test(extracted.type || '');
  const parts = bilibili
    ? [
        extracted.description,
        transcript && transcript.text,
        extracted.tags && extracted.tags.length ? '标签 ' + extracted.tags.join('、') : '',
        extracted.parts && extracted.parts.length ? '分集 ' + extracted.parts.join('、') : ''
      ].filter(Boolean)
    : [
        extracted.description,
        transcript && transcript.text,
        extracted.text
      ].filter(Boolean);
  const text = parts.join('\n\n').slice(0, 50000);

  if (!text && !extracted.title) {
    const fallback = youtubeId ? '视频页面读取失败，可能需要登录、地区限制或网站反爬' : '页面读取失败，可能需要登录或网站反爬';
    const detail = pageError && pageError.message && pageError.message !== 'fetch failed' ? pageError.message : '';
    throw new Error(detail || fallback);
  }

  const local = isVideo && !transcript && bilibili
    ? buildVideoInfoSummary(extracted)
    : summarizeLocally({
        title: extracted.title,
        description: extracted.description,
        text,
        isVideo
      });

  let summary = local;
  let warning = '';
  if (text.length > 120 && (transcript || !isVideo)) {
    try {
      const ai = await summarizeWithAi({
        title: extracted.title,
        url,
        text,
        isVideo
      });
      if (ai) summary = ai;
    } catch (error) {
      warning = 'AI 摘要失败，已改用本地摘要。' + (error && error.message ? ' ' + error.message : '');
    }
  }

  if (pageError && !warning) {
    warning = '页面正文读取不完整，摘要基于能拿到的信息。';
  }
  if (isVideo && !transcript && !warning) {
    warning = bilibili
      ? '没有拿到视频字幕，下面只有标题、作者、时长和简介。'
      : '没有拿到视频字幕，摘要基于标题、简介和页面信息。';
  }
  if (summary && summary.warning && !warning) warning = summary.warning;

  return {
    url,
    finalUrl: page ? page.finalUrl : url,
    title: extracted.title || hostOf(url) || url,
    site: extracted.siteName || hostOf(page ? page.finalUrl : url),
    type: isVideo ? 'video' : 'article',
    isVideo,
    summary: {
      tldr: summary.tldr,
      bullets: summary.bullets || [],
      longSummary: summary.longSummary || '',
      keyPoints: summary.keyPoints || []
    },
    provider: summary.provider || 'local',
    transcriptSource: transcript ? transcript.source : isVideo ? 'metadata' : '',
    warning,
    meta: {
      description: extracted.description,
      author: extracted.author,
      publishedAt: extracted.publishedAt,
      image: extracted.image,
      charCount: text.length,
      language: transcript ? transcript.language : '',
      duration: extracted.duration || 0,
      tags: extracted.tags || []
    }
  };
}

module.exports = {
  summarizeUrl,
  hostOf,
  formatDuration,
  buildVideoInfoSummary
};
