// TabMixer v2 · by XYLAS · https://github.com/xylas007

document.addEventListener('DOMContentLoaded', async () => {

  const tabListEl   = document.getElementById('tabList');
  const emptyEl     = document.getElementById('emptyState');
  const tabCountEl  = document.getElementById('tabCount');
  const statusDotEl = document.getElementById('statusDot');
  const resetBtn    = document.getElementById('resetAllBtn');
  const githubLink  = document.getElementById('githubLink');
  const themeBtn    = document.getElementById('themeBtn');
  const template    = document.getElementById('tabCardTemplate');

  const tabsData = new Map();

  // ── Theme ─────────────────────────────────────────────────
  let isDark = true;
  chrome.storage.local.get(['tabmixer_theme'], function(res) {
    isDark = res.tabmixer_theme !== 'light';
    applyTheme();
  });

  function applyTheme() {
    document.body.classList.toggle('light', !isDark);
    themeBtn.innerHTML = isDark
      ? '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4.22 1.78a1 1 0 011.42 1.42l-.7.7a1 1 0 11-1.42-1.42l.7-.7zM18 9a1 1 0 110 2h-1a1 1 0 110-2h1zM4.22 15.78a1 1 0 001.42-1.42l-.7-.7a1 1 0 00-1.42 1.42l.7.7zM10 16a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zm-5.78-.22a1 1 0 001.42-1.42l-.7-.7a1 1 0 00-1.42 1.42l.7.7zM4 10a1 1 0 110-2H3a1 1 0 100 2h1zm11.78-4.22a1 1 0 00-1.42-1.42l-.7.7a1 1 0 001.42 1.42l.7-.7zM10 6a4 4 0 100 8 4 4 0 000-8z"/></svg>'
      : '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/></svg>';
    themeBtn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  }

  themeBtn.addEventListener('click', function() {
    isDark = !isDark;
    applyTheme();
    chrome.storage.local.set({ tabmixer_theme: isDark ? 'dark' : 'light' });
  });

  // ── GitHub link ───────────────────────────────────────────
  githubLink.addEventListener('click', e => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://github.com/xylas007' });
  });

  // ── Dual-zone slider math ─────────────────────────────────
  function posToVol(pos) {
    pos = Math.max(0, Math.min(1000, Number(pos)));
    if (pos <= 500) return Math.round((pos / 500) * 100);
    return Math.round(100 + ((pos - 500) / 500) * 500);
  }

  function volToPos(vol) {
    vol = Math.max(0, Math.min(600, Number(vol)));
    if (vol <= 100) return Math.round((vol / 100) * 500);
    return Math.round(500 + ((vol - 100) / 500) * 500);
  }

  // ── Load tabs (audible only) ──────────────────────────────
  async function loadTabs() {
    setStatus('Scanning...', true);

    let tabs = [];
    try {
      // Only grab tabs that are currently playing audio
      tabs = await chrome.tabs.query({ audible: true });
    } catch(e) {}

    let saved = {};
    try { saved = await getSavedVolumes(); } catch(e) {}

    tabsData.clear();
    tabs.forEach(function(t) {
      tabsData.set(t.id, { tab: t, volume: saved[t.id] != null ? saved[t.id] : 100 });
    });

    render();
  }

  // ── Render ────────────────────────────────────────────────
  function render() {
    tabListEl.innerHTML = '';
    const entries = Array.from(tabsData.values());

    if (entries.length === 0) {
      emptyEl.style.display   = '';
      tabListEl.style.display = 'none';
      setStatus('No audio playing', false);
      return;
    }

    emptyEl.style.display   = 'none';
    tabListEl.style.display = '';
    setStatus(entries.length + ' tab' + (entries.length !== 1 ? 's' : '') + ' playing', true);

    entries.forEach(function(entry, i) {
      const card = buildCard(entry.tab, entry.volume);
      card.style.animationDelay = (i * 0.055) + 's';
      tabListEl.appendChild(card);
    });
  }

  // ── Build card ────────────────────────────────────────────
  function buildCard(tab, volume) {
    const frag    = template.content.cloneNode(true);
    const card    = frag.querySelector('.tab-card');
    const favicon = frag.querySelector('.tab-favicon');
    const titleEl = frag.querySelector('.tab-title');
    const slider  = frag.querySelector('.vol-slider');
    const volDisp = frag.querySelector('.vol-display');
    const muteBtn = frag.querySelector('.mute-btn');
    const stepUp  = frag.querySelector('.step-up');
    const stepDn  = frag.querySelector('.step-down');
    const presets = frag.querySelectorAll('.preset-btn');

    card.dataset.tabId  = tab.id;
    card.dataset.volume = volume;

    if (tab.favIconUrl) {
      favicon.src = tab.favIconUrl;
      favicon.onerror = function() { favicon.style.display = 'none'; };
    } else {
      favicon.style.display = 'none';
    }

    titleEl.textContent = tab.title || 'Untitled Tab';
    titleEl.title       = tab.title || '';

    // Green "playing" dot for all tabs here (all are audible)
    var dot = document.createElement('span');
    dot.className = 'playing-badge';
    dot.title     = 'Audio playing';
    titleEl.after(dot);

    refreshCard(card, slider, volDisp, muteBtn, presets, volume);

    slider.addEventListener('input', function() {
      setVolume(tab.id, card, slider, volDisp, muteBtn, presets, posToVol(slider.value), false);
    });
    slider.addEventListener('change', function() {
      saveVolume(tab.id, posToVol(slider.value));
    });

    muteBtn.addEventListener('click', function() {
      var cur = parseInt(card.dataset.volume) || 0;
      if (cur > 0) {
        card.dataset.prevVolume = cur;
        setVolume(tab.id, card, slider, volDisp, muteBtn, presets, 0);
      } else {
        setVolume(tab.id, card, slider, volDisp, muteBtn, presets, parseInt(card.dataset.prevVolume) || 100);
      }
    });

    stepUp.addEventListener('click', function() {
      setVolume(tab.id, card, slider, volDisp, muteBtn, presets, Math.min(600, (parseInt(card.dataset.volume) || 0) + 5));
    });
    stepDn.addEventListener('click', function() {
      setVolume(tab.id, card, slider, volDisp, muteBtn, presets, Math.max(0, (parseInt(card.dataset.volume) || 0) - 5));
    });

    presets.forEach(function(btn) {
      btn.addEventListener('click', function() {
        setVolume(tab.id, card, slider, volDisp, muteBtn, presets, parseInt(btn.dataset.vol));
      });
    });

    return card;
  }

  // ── Volume logic ──────────────────────────────────────────
  function setVolume(tabId, card, slider, volDisp, muteBtn, presets, volume, autosave) {
    if (autosave === undefined) autosave = true;
    volume = Math.max(0, Math.min(600, Math.round(volume)));
    card.dataset.volume = volume;
    if (tabsData.has(tabId)) tabsData.get(tabId).volume = volume;
    refreshCard(card, slider, volDisp, muteBtn, presets, volume);
    sendVolume(tabId, volume);
    if (autosave) saveVolume(tabId, volume);
  }

  function refreshCard(card, slider, volDisp, muteBtn, presets, volume) {
    var pos     = volToPos(volume);
    var fillPct = ((pos / 1000) * 100).toFixed(2) + '%';

    slider.value = pos;
    slider.style.setProperty('--fill', fillPct);
    slider.classList.toggle('muted', volume === 0);

    volDisp.textContent = volume + '%';
    volDisp.classList.remove('muted', 'boosted');
    if (volume === 0)      volDisp.classList.add('muted');
    else if (volume > 100) volDisp.classList.add('boosted');

    muteBtn.classList.toggle('muted', volume === 0);
    presets.forEach(function(btn) {
      btn.classList.toggle('active', parseInt(btn.dataset.vol) === volume);
    });
  }

  async function sendVolume(tabId, volume) {
    var msg = { action: 'setVolume', volume: volume };
    try {
      await chrome.tabs.sendMessage(tabId, msg);
    } catch(e) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['scripts/content.js'] });
        await new Promise(function(r) { setTimeout(r, 150); });
        chrome.tabs.sendMessage(tabId, msg).catch(function() {});
      } catch(e2) {}
    }
  }

  function saveVolume(tabId, volume) {
    chrome.runtime.sendMessage({ action: 'saveVolume', tabId: tabId, volume: volume });
  }

  function getSavedVolumes() {
    return new Promise(function(resolve) {
      chrome.runtime.sendMessage({ action: 'getAllTabVolumes' }, function(res) {
        resolve((res && res.success && res.volumes) ? res.volumes : {});
      });
    });
  }

  // ── Reset all ─────────────────────────────────────────────
  resetBtn.addEventListener('click', function() {
    var count = 0;
    tabsData.forEach(function(data, tabId) {
      var card = tabListEl.querySelector('.tab-card[data-tab-id="' + tabId + '"]');
      if (!card) return;
      setVolume(tabId, card,
        card.querySelector('.vol-slider'),
        card.querySelector('.vol-display'),
        card.querySelector('.mute-btn'),
        card.querySelectorAll('.preset-btn'), 100);
      count++;
    });
    var orig = tabCountEl.textContent;
    setStatus('Reset ' + count + ' tab' + (count !== 1 ? 's' : '') + ' to 100%', true);
    setTimeout(function() { tabCountEl.textContent = orig; }, 2500);
  });

  function setStatus(text, active) {
    tabCountEl.textContent = text;
    statusDotEl.classList.toggle('inactive', !active);
  }

  await loadTabs();
});
