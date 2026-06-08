/* ============================================
   先斗寧 (Ponto Nei) — 推文整理逻辑
   ============================================ */

const TWEET_CATEGORIES = [
  { key: 'all',             label: '🐦 全部推文' },
  { key: '直播预告',         label: '📡 直播预告' },
  { key: '视频和短视频预告', label: '🎬 视频/短视频预告' },
  { key: '日常推文',         label: '💬 日常推文' },
  { key: '手动添加',         label: '✏️ 手动添加' },
];

let allTweets = [];
let currentFilter = 'all';

function getManualTweetsKey() {
  var user = getCurrentUser();
  return user ? 'ponto-nei-manual-tweets-' + user.username : 'ponto-nei-manual-tweets';
}

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  fetchAndRender();
  initManualForm();
});

function initNavbar() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });
  const link = document.querySelector('.nav-links a[href="tweets.html"]');
  if (link) link.classList.add('active');
}

/**
 * 加载多数据源并合并
 */
async function fetchAndRender() {
  const grid = document.getElementById('tweet-grid');
  if (!grid) return;

  grid.innerHTML = `<div class="archive-skeleton">
    <div class="spinner"></div>
    <span>読み込み中...</span>
  </div>`;

  let autoTweets = [];
  let manualTweets = [];

  // 1. 自动推文 (data/tweets.json)
  try {
    const resp = await fetch('data/tweets.json');
    if (resp.ok) {
      const data = await resp.json();
      autoTweets = data.tweets || [];
      document.getElementById('archive-updated').textContent =
        '最終更新: ' + new Date(data.lastUpdated).toLocaleDateString('ja-JP');
    }
  } catch {}

  // 2. 手动推文 (data/tweets-manual.json)
  try {
    const resp = await fetch('data/tweets-manual.json');
    if (resp.ok) {
      const data = await resp.json();
      manualTweets = data || [];
    }
  } catch {}

  // 3. localStorage 手动推文
  try {
    // 只加载自己的手动推文（游客：公共键，登录用户：私有键）
    var key = getManualTweetsKey();
    var localTweets = [];
    try { localTweets = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
    manualTweets = manualTweets.concat(localTweets);
  } catch {}

  // 合并去重
  var seen = new Set();
  var merged = [];
  for (var i = 0; i < autoTweets.length; i++) { seen.add(autoTweets[i].id); merged.push(Object.assign({}, autoTweets[i], { source: 'auto' })); }
  for (var j = 0; j < manualTweets.length; j++) {
    if (!seen.has(manualTweets[j].id)) { seen.add(manualTweets[j].id); merged.push(Object.assign({}, manualTweets[j], { source: 'manual' })); }
  }
  merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  allTweets = merged;
  buildFilterTabs();
  updateMeta();
  renderTweets();
}

function buildFilterTabs() {
  const container = document.getElementById('filter-bar');
  if (!container) return;

  const counts = {};
  counts['all'] = allTweets.length;
  TWEET_CATEGORIES.forEach(cat => {
    if (cat.key === 'all') return;
    if (cat.key === '手动添加') {
      counts[cat.key] = allTweets.filter(t => t.source === 'manual').length;
    } else {
      counts[cat.key] = allTweets.filter(t => t.category === cat.key).length;
    }
  });

  container.innerHTML = TWEET_CATEGORIES
    .filter(cat => counts[cat.key] > 0 || cat.key === 'all')
    .map(cat => `
      <button class="filter-tab${cat.key === currentFilter ? ' active' : ''}"
              data-filter="${cat.key}">
        ${cat.label}<span class="count">${counts[cat.key]}</span>
      </button>
    `).join('');

  container.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      container.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTweets();
    });
  });
}

function updateMeta() {
  const countEl = document.getElementById('archive-count');
  if (countEl) countEl.textContent = `共 ${allTweets.length} 条推文`;
}

function renderTweets() {
  const grid = document.getElementById('tweet-grid');
  if (!grid) return;

  let tweets = allTweets;
  if (currentFilter === '手动添加') {
    tweets = tweets.filter(t => t.source === 'manual');
  } else if (currentFilter !== 'all') {
    tweets = tweets.filter(t => t.category === currentFilter);
  }

  const countEl = document.getElementById('archive-count');
  if (countEl) countEl.textContent = `共 ${tweets.length} 条推文`;

  if (tweets.length === 0) {
    grid.innerHTML = `<div class="empty-state">
      <span class="empty-icon">🐦</span>
      <h3>该分类暂无推文</h3>
    </div>`;
    return;
  }

  grid.innerHTML = tweets.map(t => buildTweetCard(t)).join('');
}

function buildTweetCard(tweet) {
  const date = new Date(tweet.createdAt);
  const dateStr = date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

  const manualBadge = tweet.source === 'manual'
    ? `<div class="tweet-manual-badge">✏️ 手动添加</div>`
    : '';

  return `
    <div class="card tweet-card">
      ${manualBadge}
      <div class="tweet-header">
        <div class="tweet-avatar">🫐</div>
        <span class="tweet-user">先斗寧</span>
        <span class="tweet-handle">@ponto_nei</span>
        <span class="tweet-date">${dateStr} ${timeStr}</span>
      </div>
      <div class="tweet-body">${linkifyText(escapeHtml(tweet.text))}</div>
      ${tweet.media && tweet.media.length ? buildMediaGrid(tweet.media) : ''}
      <div class="tweet-footer">
        <span class="tweet-category">${escapeHtml(tweet.category)}</span>
        ${tweet.likes != null ? `<span>❤️ ${formatCount(tweet.likes)}</span>` : ''}
        ${tweet.retweets != null ? `<span>🔁 ${formatCount(tweet.retweets)}</span>` : ''}
        <a href="${escapeHtml(tweet.url)}" target="_blank" rel="noopener" class="tweet-link">
          Xで見る →
        </a>
      </div>
    </div>`;
}

function buildMediaGrid(media) {
  const images = media.filter(m => m.type === 'photo');
  if (!images.length) return '';
  return `<div class="tweet-media-grid">
    ${images.map(m => `<img src="${escapeHtml(m.url)}" alt="添付画像" loading="lazy">`).join('')}
  </div>`;
}

function linkifyText(text) {
  return text.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener">$1</a>'
  );
}

function formatCount(n) {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

// ── 手动添加推文 ────────────────────────────────────
function initManualForm() {
  // 折叠面板
  const toggle = document.getElementById('manual-toggle');
  const body = document.getElementById('manual-body');
  if (toggle && body) {
    toggle.addEventListener('click', () => body.classList.toggle('expanded'));
  }

  const form = document.getElementById('manual-form');
  if (!form) return;

  // 自动检测分类
  const textInput = document.getElementById('manual-text');
  const catSelect = document.getElementById('manual-category');

  if (textInput && catSelect) {
    textInput.addEventListener('input', () => {
      const text = textInput.value;
      if (text.includes('配信') || text.includes('待機') || text.includes('ライブ')) catSelect.value = '直播预告';
      else if (text.includes('動画') || text.includes('Short') || text.includes('公開')) catSelect.value = '视频和短视频预告';
      else catSelect.value = '日常推文';
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    // 需要登录才能手动添加推文
    if (!requireAuth()) return;

    const url = document.getElementById('manual-url').value.trim();
    const text = document.getElementById('manual-text').value.trim();
    const dateStr = document.getElementById('manual-date').value;
    const category = document.getElementById('manual-category').value;

    if (!url || !text) {
      alert('请输入推文链接和正文');
      return;
    }

    // 从 URL 提取 ID
    const idMatch = url.match(/\/status\/(\d+)/);
    const id = idMatch ? idMatch[1] : 'manual_' + Date.now();

    const tweet = {
      id,
      text,
      createdAt: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
      category,
      url,
      media: [],
      isRetweet: false,
      retweetSource: null,
      likes: 0,
      retweets: 0,
      source: 'manual',
    };

    // 存到 localStorage（按账号隔离）
    var tweetKey = getManualTweetsKey();
    var manualTweets = [];
    try { manualTweets = JSON.parse(localStorage.getItem(tweetKey) || '[]'); } catch {}
    manualTweets = manualTweets.filter(function(t) { return t.id !== id; });
    manualTweets.push(tweet);
    localStorage.setItem(tweetKey, JSON.stringify(manualTweets));

    // 清空表单
    document.getElementById('manual-url').value = '';
    document.getElementById('manual-text').value = '';
    document.getElementById('manual-date').value = '';

    // 刷新列表
    allTweets = allTweets.filter(t => t.id !== id);
    allTweets.push(tweet);
    allTweets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    buildFilterTabs();
    updateMeta();
    renderTweets();

    // 滚动到新推文
    window.scrollTo({ top: document.getElementById('tweet-grid').offsetTop - 100, behavior: 'smooth' });
  });

  // 导出 localStorage 数据（普通用户：复制自己的推文）
  var exportBtn = document.getElementById('manual-export');
  if (exportBtn) {
    exportBtn.addEventListener('click', function() {
      var tweetKey = getManualTweetsKey();
      var manualTweets = [];
      try { manualTweets = JSON.parse(localStorage.getItem(tweetKey) || '[]'); } catch {}
      if (!manualTweets.length) {
        alert('暂无手动添加的推文');
        return;
      }
      var json = JSON.stringify(manualTweets, null, 2);
      navigator.clipboard.writeText(json).then(function() {
        alert('已复制 ' + manualTweets.length + ' 条手动推文到剪贴板！\n\n发给我即可同步到网站。');
      }).catch(function() {
        alert('复制失败，请手动复制：\n\n' + json);
      });
    });
  }

  // 管理员发布按钮（将推文发布到公共 JSON）
  var publishBtn = document.getElementById('btn-publish');
  if (publishBtn) {
    publishBtn.addEventListener('click', function() {
      var tweetKey = getManualTweetsKey();
      var manualTweets = [];
      try { manualTweets = JSON.parse(localStorage.getItem(tweetKey) || '[]'); } catch {}
      if (!manualTweets.length) {
        alert('暂无手动添加的推文可发布');
        return;
      }
      var json = JSON.stringify(manualTweets, null, 2);
      navigator.clipboard.writeText(json).then(function() {
        alert('✅ 已复制 ' + manualTweets.length + ' 条推文的 JSON 数据！\n\n请覆盖 data/tweets-manual.json 并提交到 GitHub，所有用户即可看到。');
      }).catch(function() {
        alert('复制失败，请手动复制：\n\n' + json);
      });
    });
  }

  // 管理员发布栏显隐
  updateAdminBar();
}

function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(str).replace(/[&<>"']/g, c => map[c]);
}

// ── 管理员发布栏显隐 ──────────────────────────
function updateAdminBar() {
  var bar = document.getElementById('admin-bar');
  if (!bar) return;
  var user = getCurrentUser();
  if (user && user.isAdmin) {
    bar.classList.add('visible');
  } else {
    bar.classList.remove('visible');
  }
}

// ── 登录/注册成功回调（覆盖 auth.js 默认） ──
onAuthSuccess = function() {
  updateAdminBar();
  fetchAndRender();
};
