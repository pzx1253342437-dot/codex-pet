(() => {
  'use strict';

  const api = window.petAPI || null;
  const $ = (id) => document.getElementById(id);
  const elements = {
    bubble: $('bubble'),
    emptyState: $('emptyState'),
    loading: $('loading'),
    loadingText: $('loadingText'),
    result: $('result'),
    resultType: $('resultType'),
    resultSite: $('resultSite'),
    resultTitle: $('resultTitle'),
    resultTldr: $('resultTldr'),
    resultBullets: $('resultBullets'),
    resultWarning: $('resultWarning'),
    longToggle: $('longToggle'),
    longSummary: $('longSummary'),
    openSource: $('openSource'),
    clearResult: $('clearResult'),
    error: $('error'),
    errorText: $('errorText'),
    clearError: $('clearError'),
    provider: $('provider'),
    urlInput: $('urlInput'),
    sendBtn: $('sendBtn'),
    petWrap: $('petWrap'),
    mouthDrop: $('mouthDrop'),
    dropHint: $('dropHint'),
    skinBtn: $('skinBtn'),
    skinMenu: $('skinMenu'),
    closeBtn: $('closeBtn')
  };

  const skinNames = {
    ink: '墨墨',
    cloud: '云朵',
    circuit: '电路兔'
  };

  let currentResult = null;
  let longOpen = false;
  let skin = localStorage.getItem('codex-pet-skin') || 'ink';
  if (!skinNames[skin]) skin = 'ink';

  function applySkin(nextSkin) {
    skin = nextSkin;
    document.body.dataset.skin = skin;
    localStorage.setItem('codex-pet-skin', skin);
    for (const button of elements.skinMenu.querySelectorAll('[data-skin]')) {
      button.classList.toggle('is-active', button.dataset.skin === skin);
    }
  }

  function showOnly(name) {
    const compact = name === 'result' || name === 'loading' || name === 'error';
    document.body.classList.toggle('has-result', compact);
    elements.emptyState.classList.toggle('hidden', name !== 'empty');
    elements.loading.classList.toggle('hidden', name !== 'loading');
    elements.result.classList.toggle('hidden', name !== 'result');
    elements.error.classList.toggle('hidden', name !== 'error');
  }

  function showEmpty() {
    currentResult = null;
    longOpen = false;
    elements.provider.textContent = '';
    elements.provider.classList.add('hidden');
    elements.longSummary.classList.add('hidden');
    elements.longToggle.classList.add('hidden');
    elements.resultWarning.classList.add('hidden');
    elements.errorText.textContent = '';
    showOnly('empty');
  }

  function showLoading() {
    elements.loadingText.textContent = '正在读页面...';
    showOnly('loading');
    window.setTimeout(() => {
      if (!elements.loading.classList.contains('hidden')) {
        elements.loadingText.textContent = '正在整理重点...';
      }
    }, 900);
  }

  function showError(message) {
    currentResult = null;
    elements.errorText.textContent = message || '读取失败。';
    showOnly('error');
  }

  function renderResult(data) {
    currentResult = data;
    longOpen = false;
    const hasTranscript = Boolean(data.transcriptSource && data.transcriptSource !== 'metadata' && data.transcriptSource !== 'page');
    elements.provider.textContent = data.provider === 'local' ? '本地摘要' : 'AI · ' + data.provider;
    elements.provider.classList.remove('hidden');
    elements.resultType.textContent = data.isVideo ? (hasTranscript ? '视频长摘要' : '视频信息') : '网页摘要';
    elements.resultSite.textContent = data.site || '';
    elements.resultTitle.textContent = data.title || '未命名内容';
    elements.resultTldr.textContent = data.summary && data.summary.tldr ? data.summary.tldr : '没有拿到摘要。';

    elements.resultBullets.innerHTML = '';
    const bullets = data.summary && Array.isArray(data.summary.bullets) ? data.summary.bullets : [];
    for (const bullet of bullets) {
      const item = document.createElement('li');
      item.textContent = bullet;
      elements.resultBullets.appendChild(item);
    }
    elements.resultBullets.classList.toggle('hidden', bullets.length === 0);

    const longSummary = data.summary && data.summary.longSummary ? data.summary.longSummary : '';
    elements.longSummary.textContent = longSummary;
    elements.longSummary.classList.add('hidden');
    const longLabel = data.isVideo && !hasTranscript ? '展开视频信息' : '展开长摘要';
    elements.longToggle.dataset.openLabel = longLabel;
    elements.longToggle.dataset.closeLabel = longLabel.replace('展开', '收起');
    elements.longToggle.textContent = longLabel;
    elements.longToggle.classList.toggle('hidden', !longSummary || longSummary.length < 80);

    const warning = data.warning || '';
    elements.resultWarning.textContent = warning;
    elements.resultWarning.classList.toggle('hidden', !warning);

    showOnly('result');
    elements.bubble.scrollTop = 0;
  }

  function extractUrl(value) {
    const match = String(value || '').match(/https?:\/\/[^\s"'<>]+/i);
    return match ? match[0] : '';
  }

  async function handleUrl(value) {
    const url = extractUrl(value);
    if (!url) {
      showError('没有识别到链接。把完整网址拖进来。');
      return;
    }
    if (!api) {
      showError('这是浏览器预览。用 npm start 启动桌面版后才能读网页。');
      return;
    }
    showLoading();
    petEat();
    try {
      const response = await api.summarize(url);
      if (!response || !response.ok) throw new Error(response && response.error ? response.error : '读取失败');
      renderResult(response.data);
    } catch (error) {
      showError(error && error.message ? error.message : '读取失败');
      petShake();
    }
  }

  function petEat() {
    elements.petWrap.classList.remove('is-eating');
    void elements.petWrap.offsetWidth;
    elements.petWrap.classList.add('is-eating');
    window.setTimeout(() => elements.petWrap.classList.remove('is-eating'), 760);
  }

  function petShake() {
    elements.petWrap.classList.remove('is-error');
    void elements.petWrap.offsetWidth;
    elements.petWrap.classList.add('is-error');
    window.setTimeout(() => elements.petWrap.classList.remove('is-error'), 500);
  }

  function setDropState(active, text) {
    elements.petWrap.classList.toggle('is-over', active);
    elements.mouthDrop.classList.toggle('is-over', active);
    elements.dropHint.textContent = active ? text || '松开就吃掉' : '把链接拖到嘴里';
  }

  function setupDrop() {
    const zone = elements.petWrap;

    for (const type of ['dragenter', 'dragover']) {
      zone.addEventListener(type, (event) => {
        event.preventDefault();
        event.stopPropagation();
        setDropState(true, '松开就吃掉');
      });
    }

    for (const type of ['dragleave', 'dragend']) {
      zone.addEventListener(type, (event) => {
        event.preventDefault();
        if (event.relatedTarget && zone.contains(event.relatedTarget)) return;
        setDropState(false);
      });
    }

    zone.addEventListener('drop', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setDropState(false);
      const data = event.dataTransfer;
      const uriList = data ? data.getData('text/uri-list') : '';
      const plain = data ? data.getData('text/plain') : '';
      const html = data ? data.getData('text/html') : '';
      const value = uriList || plain || html;
      if (!value) {
        showError('没有接到链接。换一个浏览器或直接粘贴网址。');
        return;
      }
      handleUrl(value);
    });

    window.addEventListener('dragover', (event) => event.preventDefault());
    window.addEventListener('drop', (event) => event.preventDefault());
  }

  elements.skinBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    elements.skinMenu.classList.toggle('hidden');
  });

  elements.skinMenu.addEventListener('click', (event) => {
    event.stopPropagation();
    const button = event.target.closest('[data-skin]');
    if (!button) return;
    applySkin(button.dataset.skin);
    elements.skinMenu.classList.add('hidden');
  });

  document.addEventListener('click', () => {
    elements.skinMenu.classList.add('hidden');
  });

  elements.longToggle.addEventListener('click', () => {
    longOpen = !longOpen;
    elements.longSummary.classList.toggle('hidden', !longOpen);
    elements.longToggle.textContent = longOpen
      ? elements.longToggle.dataset.closeLabel || '收起长摘要'
      : elements.longToggle.dataset.openLabel || '展开长摘要';
    if (longOpen) elements.bubble.scrollTop = elements.bubble.scrollHeight;
  });

  elements.openSource.addEventListener('click', () => {
    if (currentResult && api) api.openExternal(currentResult.url);
  });

  elements.clearResult.addEventListener('click', () => {
    showEmpty();
    elements.urlInput.focus();
  });

  elements.clearError.addEventListener('click', () => {
    showEmpty();
    elements.urlInput.focus();
  });

  elements.sendBtn.addEventListener('click', () => {
    handleUrl(elements.urlInput.value);
  });

  elements.urlInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') handleUrl(elements.urlInput.value);
  });

  elements.mouthDrop.addEventListener('click', () => {
    elements.urlInput.focus();
  });

  elements.closeBtn.addEventListener('click', () => {
    if (api) api.close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!elements.skinMenu.classList.contains('hidden')) {
        elements.skinMenu.classList.add('hidden');
      } else {
        showEmpty();
      }
    }
  });

  applySkin(skin);
  setupDrop();
  showEmpty();

  window.__codexPetDebug = {
    handleUrl: handleUrl,
    renderResult: renderResult,
    showError: showError
  };
})();
