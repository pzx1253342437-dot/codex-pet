const { parse } = require('node-html-parser');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 CodexPet/0.1';
const MAX_TEXT = 60000;

function normalizeUrl(input) {
  const raw = String(input || '').trim();
  const match = raw.match(/https?:\/\/[^\s"'<>。！？，；：、）】》]+/i);
  if (!match) throw new Error('没有识别到网页链接');
  const url = new URL(match[0]);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('只支持 http 或 https 链接');
  return url.toString();
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstAttr(root, selectors, attr) {
  for (const selector of selectors) {
    const element = root.querySelector(selector);
    if (!element) continue;
    const value = element.getAttribute(attr || 'content');
    if (value && value.trim()) return value.trim();
  }
  return '';
}

function absoluteUrl(value, baseUrl) {
  if (!value) return '';
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function extractJsonAfter(html, marker) {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = html.indexOf('{', markerIndex);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function flattenJsonLd(value, output) {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) flattenJsonLd(item, output);
    return;
  }
  if (typeof value !== 'object') return;
  output.push(value);
  if (value['@graph']) flattenJsonLd(value['@graph'], output);
}

function extractJsonLd(root) {
  const output = [];
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      flattenJsonLd(JSON.parse(script.textContent), output);
    } catch {
      // Ignore malformed structured data.
    }
  }
  return output;
}

function pickJsonLdItem(items) {
  const wanted = ['videoobject', 'newsarticle', 'article', 'blogposting', 'webpage'];
  for (const type of wanted) {
    const found = items.find((item) => {
      const raw = item['@type'];
      const types = Array.isArray(raw) ? raw : [raw];
      return types.some((value) => String(value || '').toLowerCase() === type);
    });
    if (found) return found;
  }
  return items[0] || null;
}

function jsonLdAuthor(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(jsonLdAuthor).filter(Boolean).join(', ');
  return value.name || '';
}

function extractPage(html, baseUrl) {
  const root = parse(String(html || ''), { comment: false });
  const jsonLd = extractJsonLd(root);
  const structured = pickJsonLdItem(jsonLd);

  for (const selector of [
    'script',
    'style',
    'noscript',
    'svg',
    'canvas',
    'iframe',
    'nav',
    'footer',
    'aside',
    'form',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
    '[aria-hidden="true"]',
    '[class*="cookie"]',
    '[id*="cookie"]',
    '[class*="advert"]',
    '[id*="advert"]'
  ]) {
    for (const element of root.querySelectorAll(selector)) element.remove();
  }

  const title = normalizeText(
    firstAttr(root, ['meta[property="og:title"]', 'meta[name="twitter:title"]'], 'content') ||
    (structured && (structured.headline || structured.name)) ||
    (root.querySelector('title') ? root.querySelector('title').textContent : '') ||
    (root.querySelector('h1') ? root.querySelector('h1').textContent : '')
  );

  const description = normalizeText(
    firstAttr(root, ['meta[property="og:description"]', 'meta[name="description"]', 'meta[name="twitter:description"]'], 'content') ||
    (structured && structured.description) ||
    ''
  );

  const siteName = normalizeText(
    firstAttr(root, ['meta[property="og:site_name"]', 'meta[name="application-name"]'], 'content') ||
    (structured && structured.publisher && structured.publisher.name) ||
    ''
  );

  const author = normalizeText(
    firstAttr(root, ['meta[name="author"]', 'meta[property="article:author"]'], 'content') ||
    (structured && jsonLdAuthor(structured.author)) ||
    ''
  );

  const publishedAt = normalizeText(
    firstAttr(root, ['meta[property="article:published_time"]', 'meta[name="date"]', 'meta[itemprop="datePublished"]'], 'content') ||
    (structured && (structured.datePublished || structured.uploadDate)) ||
    ''
  );

  const type = normalizeText(
    firstAttr(root, ['meta[property="og:type"]'], 'content') ||
    (structured && structured['@type']) ||
    ''
  );

  const image = absoluteUrl(
    firstAttr(root, ['meta[property="og:image"]', 'meta[name="twitter:image"]'], 'content') ||
    (structured && (Array.isArray(structured.image) ? structured.image[0] : structured.image)) ||
    '',
    baseUrl
  );

  const canonical = absoluteUrl(firstAttr(root, ['link[rel="canonical"]'], 'href'), baseUrl);
  const candidates = [];
  for (const selector of ['article', 'main', '[role="main"]', '.article', '.post', '.content', 'body']) {
    for (const element of root.querySelectorAll(selector)) {
      const text = normalizeText(element.textContent);
      if (text) candidates.push(text);
    }
  }
  candidates.sort((a, b) => b.length - a.length);
  let text = candidates[0] || '';
  if (text.length < 300 && description) text = normalizeText(description + ' ' + text);
  text = text.slice(0, MAX_TEXT);

  return {
    title,
    description,
    siteName,
    author,
    publishedAt,
    type,
    image,
    canonical,
    text
  };
}

function extractBilibiliPage(html, baseUrl) {
  const state = extractJsonAfter(html, '__INITIAL_STATE__=');
  const video = state && state.videoData;
  if (!video) return null;

  const rawDescription = normalizeText(video.desc);
  const description = rawDescription && rawDescription !== '-' ? rawDescription : '';
  const tags = Array.isArray(state.tags)
    ? state.tags
        .map((item) => normalizeText(item && (item.tag_name || item.name || item)))
        .filter(Boolean)
        .slice(0, 10)
    : [];
  const title = normalizeText(video.title);
  const parts = Array.isArray(video.pages)
    ? video.pages
        .map((item) => normalizeText(item && item.part))
        .filter((part) => part && part !== title)
        .slice(0, 12)
    : [];
  const subtitleTracks = video.subtitle && Array.isArray(video.subtitle.list)
    ? video.subtitle.list
        .map((track) => ({
          language: track.lan || '',
          languageLabel: track.lan_doc || '',
          url: track.subtitle_url ? absoluteUrl(track.subtitle_url, baseUrl) : '',
          locked: Boolean(track.is_lock)
        }))
        .filter((track) => track.url && !track.locked)
    : [];

  return {
    title,
    description,
    siteName: '哔哩哔哩',
    author: normalizeText(video.owner && video.owner.name),
    publishedAt: video.pubdate ? new Date(video.pubdate * 1000).toISOString() : '',
    type: 'video',
    image: absoluteUrl(video.pic, baseUrl),
    canonical: '',
    text: '',
    duration: Number(video.duration) || 0,
    tags,
    parts,
    bvid: state.bvid || video.bvid || '',
    aid: state.aid || video.aid || 0,
    cid: state.cid || video.cid || 0,
    subtitleTracks
  };
}

async function fetchText(url, options) {
  const timeout = (options && options.timeout) || 18000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
        ...((options && options.headers) || {})
      }
    });
    if (!response.ok) throw new Error('页面返回 ' + response.status);
    const contentType = response.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml|text\/plain|application\/json/i.test(contentType)) {
      throw new Error('这个链接不是可读网页');
    }
    const body = await response.text();
    return { body, finalUrl: response.url || url, contentType };
  } catch (error) {
    if (error && error.name === 'AbortError') throw new Error('读取超时，网站没有在 18 秒内返回');
    if (error instanceof TypeError && /fetch failed/i.test(error.message)) {
      throw new Error('连接网站失败，可能是网络、地区限制或网站反爬');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function getYouTubeId(input) {
  const value = String(input || '');
  const direct = value.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?.*?v=|shorts\/|embed\/|live\/))([A-Za-z0-9_-]{11})/i);
  return direct ? direct[1] : '';
}

function isVideoUrl(input) {
  const host = (() => {
    try {
      return new URL(input).hostname.toLowerCase();
    } catch {
      return '';
    }
  })();
  return Boolean(getYouTubeId(input)) ||
    /(^|\.)bilibili\.com$/.test(host) ||
    /(^|\.)b23\.tv$/.test(host) ||
    /(^|\.)vimeo\.com$/.test(host) ||
    /(^|\.)tiktok\.com$/.test(host) ||
    /(^|\.)douyin\.com$/.test(host) ||
    /(^|\.)twitch\.tv$/.test(host) ||
    /(^|\.)iqiyi\.com$/.test(host) ||
    /(^|\.)youku\.com$/.test(host) ||
    /(^|\.)v\.qq\.com$/.test(host);
}

function isBilibiliUrl(input) {
  try {
    const host = new URL(input).hostname.toLowerCase();
    return /(^|\.)bilibili\.com$/.test(host) || /(^|\.)b23\.tv$/.test(host);
  } catch {
    return false;
  }
}

async function fetchYouTubeTranscript(videoId) {
  if (!videoId) return null;
  const watchUrl = 'https://www.youtube.com/watch?v=' + videoId + '&hl=en';
  const page = await fetchText(watchUrl, { timeout: 20000 });
  const player = extractJsonAfter(page.body, 'ytInitialPlayerResponse');
  const tracks = player && player.captions && player.captions.playerCaptionsTracklistRenderer
    ? player.captions.playerCaptionsTracklistRenderer.captionTracks || []
    : [];
  if (!tracks.length) return null;
  const track = tracks.find((item) => /^zh/i.test(item.languageCode || '')) || tracks[0];
  const baseUrl = track.baseUrl + (track.baseUrl.includes('fmt=') ? '' : '&fmt=json3');
  const transcriptPage = await fetchText(baseUrl, { timeout: 20000 });
  const data = JSON.parse(transcriptPage.body);
  const lines = (data.events || [])
    .map((event) => (event.segs || []).map((seg) => seg.utf8 || '').join(''))
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const text = lines.join(' ').trim();
  if (!text) return null;
  return { text, language: track.languageCode || '', source: 'youtube-captions' };
}

async function fetchYouTubeOEmbed(videoId) {
  try {
    const page = await fetchText('https://www.youtube.com/oembed?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + videoId) + '&format=json', { timeout: 12000 });
    return JSON.parse(page.body);
  } catch {
    return null;
  }
}

function pickBilibiliSubtitleTrack(payload) {
  const player = payload && payload.data ? payload.data : {};
  const subtitle = player.subtitle || {};
  const tracks = Array.isArray(subtitle.subtitles) ? subtitle.subtitles : [];
  if (!tracks.length) {
    return {
      track: null,
      reason: player.need_login_subtitle ? 'login-required' : 'no-subtitle'
    };
  }
  const track = tracks.find((item) => /^zh/i.test(item.lan || item.language || '')) || tracks[0];
  return { track, reason: '' };
}

function parseBilibiliSubtitleBody(value) {
  const data = typeof value === 'string' ? JSON.parse(value) : value;
  const segments = Array.isArray(data && data.body)
    ? data.body
    : Array.isArray(data && data.subtitles)
      ? data.subtitles
      : [];
  return segments
    .map((item) => normalizeText(item && (item.content || item.text)))
    .filter(Boolean)
    .join(' ');
}

async function fetchBilibiliTranscript(video) {
  const baseHeaders = {
    Referer: 'https://www.bilibili.com/video/' + ((video && video.bvid) || ''),
    Origin: 'https://www.bilibili.com'
  };
  const cookie = String(process.env.BILIBILI_COOKIE || '').trim();
  const apiHeaders = cookie ? { ...baseHeaders, Cookie: cookie } : baseHeaders;
  let tracks = [];
  let reason = '';

  if (video && video.aid && video.cid) {
    try {
      const page = await fetchText(
        'https://api.bilibili.com/x/player/v2?aid=' + encodeURIComponent(video.aid) + '&cid=' + encodeURIComponent(video.cid),
        { timeout: 20000, headers: { ...apiHeaders, Accept: 'application/json' } }
      );
      const picked = pickBilibiliSubtitleTrack(JSON.parse(page.body));
      tracks = picked.track ? [picked.track] : [];
      reason = picked.reason;
    } catch {
      reason = 'fetch-failed';
    }
  }

  if (!tracks.length && video && Array.isArray(video.subtitleTracks)) {
    tracks = video.subtitleTracks;
  }

  const track = tracks.find((item) => /^zh/i.test(item.lan || item.language || '')) || tracks[0];
  if (!track) return { reason: reason || 'no-subtitle' };
  const subtitleUrl = track.subtitle_url
    ? absoluteUrl(track.subtitle_url, 'https://www.bilibili.com')
    : track.url;
  if (!subtitleUrl) return { reason: reason || 'no-subtitle' };

  try {
    const page = await fetchText(subtitleUrl, { timeout: 20000, headers: apiHeaders });
    const text = parseBilibiliSubtitleBody(page.body);
    if (!text) return { reason: 'empty-subtitle' };
    return { text, language: track.lan || track.language || '', source: 'bilibili-captions' };
  } catch {
    return { reason: 'fetch-failed' };
  }
}

module.exports = {
  MAX_TEXT,
  normalizeUrl,
  normalizeText,
  extractPage,
  extractBilibiliPage,
  fetchText,
  getYouTubeId,
  isVideoUrl,
  isBilibiliUrl,
  fetchYouTubeTranscript,
  fetchYouTubeOEmbed,
  fetchBilibiliTranscript,
  pickBilibiliSubtitleTrack,
  parseBilibiliSubtitleBody
};
