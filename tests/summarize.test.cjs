const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeUrl, getYouTubeId, extractPage, extractBilibiliPage, isVideoUrl } = require('../src/extract.cjs');
const { summarizeLocally, splitSentences, uniqueSentences } = require('../src/local-summary.cjs');
const { formatDuration, buildVideoInfoSummary } = require('../src/summarize.cjs');

test('normalizeUrl 只接受 http 和 https', () => {
  assert.equal(normalizeUrl('看看这个 https://example.com/a?x=1。'), 'https://example.com/a?x=1');
  assert.throws(() => normalizeUrl('没有链接'), /没有识别到网页链接/);
});

test('getYouTubeId 支持常见地址', () => {
  assert.equal(getYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(getYouTubeId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(getYouTubeId('https://example.com/video'), '');
});

test('isVideoUrl 不会把腾讯新闻当成视频', () => {
  assert.equal(isVideoUrl('https://v.qq.com/x/cover/test.html'), true);
  assert.equal(isVideoUrl('https://news.qq.com/rain/a/20260101A00000'), false);
  assert.equal(isVideoUrl('https://www.bilibili.com/video/BV1TEST00001'), true);
});

test('extractPage 能读出标题、描述和正文', () => {
  const html = '<html><head><title>测试标题</title><meta property="og:description" content="页面描述"><meta property="og:site_name" content="测试站"></head><body><article><p>第一段正文，包含足够多的内容。</p><p>第二段正文，继续说明另外一件事。</p></article></body></html>';
  const page = extractPage(html, 'https://example.com');
  assert.equal(page.title, '测试标题');
  assert.equal(page.description, '页面描述');
  assert.equal(page.siteName, '测试站');
  assert.match(page.text, /第一段正文/);
});

test('extractBilibiliPage 只读视频信息，不把推荐位当正文', () => {
  const state = {
    bvid: 'BV1TEST00001',
    aid: 123,
    cid: 456,
    videoData: {
      title: '测试视频',
      desc: '一段视频简介',
      duration: 213,
      pubdate: 1700000000,
      owner: { name: '测试作者' },
      pic: '//i0.hdslb.com/test.jpg',
      pages: [{ part: '第一集' }],
      subtitle: {
        list: [{ lan: 'zh-CN', subtitle_url: '//example.com/sub.json', is_lock: false }]
      }
    },
    tags: [{ tag_name: '测试标签' }]
  };
  const html = '<script>window.__INITIAL_STATE__=' + JSON.stringify(state) + ';(function(){})();</script>';
  const page = extractBilibiliPage(html, 'https://www.bilibili.com/video/BV1TEST00001');
  assert.equal(page.title, '测试视频');
  assert.equal(page.description, '一段视频简介');
  assert.equal(page.author, '测试作者');
  assert.equal(page.duration, 213);
  assert.equal(page.text, '');
  assert.equal(page.tags[0], '测试标签');
  assert.equal(page.subtitleTracks[0].url, 'https://example.com/sub.json');
});

test('splitSentences 保留中文句子', () => {
  const sentences = splitSentences('第一句话。第二句话！第三句话？');
  assert.equal(sentences.length, 3);
});

test('uniqueSentences 去掉重复和包含关系的句子', () => {
  const sentences = splitSentences('视频介绍了三个主要功能。视频介绍了三个主要功能。视频介绍了三个主要功能，分别是抓取、整理和摘要。最后还演示了实际用法。');
  const unique = uniqueSentences(sentences);
  assert.equal(unique.length, 2);
});

test('本地摘要会给出 tldr、要点和长摘要', () => {
  const text = '人工智能正在改变内容整理的方式。模型可以先提取正文，再按主题归类。用户只需要把链接拖进窗口，就能看到摘要。视频内容还可以结合字幕生成更长的总结。';
  const summary = summarizeLocally({ title: 'AI 摘要', text, isVideo: true });
  assert.ok(summary.tldr.length > 0);
  assert.ok(summary.bullets.length > 0);
  assert.ok(summary.longSummary.length >= summary.tldr.length);
  assert.equal(summary.provider, 'local');
});

test('没有正文时返回可读的兜底文案', () => {
  const summary = summarizeLocally({ title: '只有标题', text: '', isVideo: false });
  assert.equal(summary.provider, 'local');
  assert.match(summary.tldr, /只有标题|没有拿到/);
});

test('视频没有字幕时只整理标题、作者、时长和标签', () => {
  assert.equal(formatDuration(213), '3:33');
  const summary = buildVideoInfoSummary({
    title: '测试视频',
    description: '',
    author: '测试作者',
    duration: 213,
    tags: ['测试标签']
  });
  assert.match(summary.tldr, /没有提供可读字幕/);
  assert.ok(summary.bullets.some((item) => item.includes('测试作者')));
  assert.ok(summary.bullets.some((item) => item.includes('3:33')));
  assert.equal(summary.longSummary, '');

  const longDescription = '这段简介比较长。'.repeat(30);
  const withDescription = buildVideoInfoSummary({
    title: '测试视频',
    description: longDescription,
    author: '测试作者',
    duration: 213,
    tags: []
  });
  assert.equal(withDescription.longSummary, longDescription);
});
