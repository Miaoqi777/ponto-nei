/* ============================================
   先斗寧 (Ponto Nei) — 推文整理逻辑
   读取 data/tweets.json，分类过滤，渲染卡片
   ============================================ */

const TWEET_CATEGORIES = [
  { key: 'all',             label: '🐦 全部推文' },
  { key: '转发直播联动',     label: '🔄 转发直播联动' },
  { key: '直播预告',         label: '📡 直播预告' },
  { key: '视频和短视频预告', label: '🎬 视频/短视频预告' },
  { key: '日常推文',         label: '💬 日常推文' },
];

let allTweets = [];
let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  fetchAndRender();
});

/**
 * 导航栏 — 滚动阴影 + 当前页高亮
 */
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
 * 获取数据并渲染
 */
async function fetchAndRender() {
  const grid = document.getElementById('tweet-grid');
  if (!grid) return;

  grid.innerHTML = `<div class="archive-skeleton">
    <div class="spinner"></div>
    <span>読み込み中...</span>
  </div>`;

  try {
    const resp = await fetch('data/tweets.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    allTweets = data.tweets || [];
    document.getElementById('archive-updated').textContent =
      '最終更新: ' + new Date(data.lastUpdated).toLocaleDateString('ja-JP');
  } catch (err) {
    grid.innerHTML = `<div class="empty-state">
      <span class="empty-icon">🐦</span>
      <h3>推文数据加载失败</h3>
      <p>请稍后刷新页面重试</p>
    </div>`;
    return;
  }

  buildFilterTabs();
  updateMeta();
  renderTweets();
}

/**
 * 构建过滤标签（带各分类计数）
 */
function buildFilterTabs() {
  const container = document.getElementById('filter-bar');
  if (!container) return;

  const counts = {};
  counts['all'] = allTweets.length;
  TWEET_CATEGORIES.forEach(cat => {
    if (cat.key !== 'all') {
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

/**
 * 更新计数徽章
 */
function updateMeta() {
  const countEl = document.getElementById('archive-count');
  if (countEl) {
    countEl.textContent = `共 ${allTweets.length} 条推文`;
  }
}

/**
 * 主渲染 — 生成推文卡片
 */
function renderTweets() {
  const grid = document.getElementById('tweet-grid');
  if (!grid) return;

  let tweets = allTweets;
  if (currentFilter !== 'all') {
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

/**
 * 构建单条推文卡片 HTML
 */
function buildTweetCard(tweet) {
  const date = new Date(tweet.createdAt);
  const dateStr = date.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'short', day: 'numeric'
  });
  const timeStr = date.toLocaleTimeString('ja-JP', {
    hour: '2-digit', minute: '2-digit'
  });

  // 转推标记
  const retweetBadge = tweet.isRetweet && tweet.retweetSource
    ? `<div class="tweet-retweet-badge">🔄 转推自 @${escapeHtml(tweet.retweetSource)}</div>`
    : '';

  return `
    <div class="card tweet-card">
      ${retweetBadge}
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

/**
 * 构建推文媒体网格
 */
function buildMediaGrid(media) {
  const images = media.filter(m => m.type === 'photo');
  if (!images.length) return '';
  return `<div class="tweet-media-grid">
    ${images.map(m => `<img src="${escapeHtml(m.url)}" alt="添付画像" loading="lazy">`).join('')}
  </div>`;
}

/**
 * 将文本中 URL 转为可点击链接
 */
function linkifyText(text) {
  return text.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener">$1</a>'
  );
}

/**
 * 格式化数字（如 12300 → "1.2万"）
 */
function formatCount(n) {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

/**
 * HTML 转义
 */
function escapeHtml(str) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return String(str).replace(/[&<>"']/g, c => map[c]);
}
