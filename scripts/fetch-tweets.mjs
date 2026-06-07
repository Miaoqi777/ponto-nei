/**
 * Twitter/X 推文数据获取脚本
 * 使用 X.com 内部 GraphQL API（Guest Token，无需 API Key）
 * 输出: data/tweets.json
 *
 * 运行: node scripts/fetch-tweets.mjs
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');

const TWITTER_USERNAME = 'ponto_nei';
const OUTPUT_PATH = join(DATA_DIR, 'tweets.json');
const MAX_TWEETS = 50;

let DEBUG_LOG = [];

// ── 分类关键词 ──────────────────────────────────────
const STREAM_KEYWORDS = [
  '配信', '生放送', 'ライブ', 'live', '放送', '枠',
  '開始', 'スタート', '予定', '今夜', '明日', '本日',
  '遊びに来て', '見に来て', '待機', 'まもなく',
];

const VIDEO_KEYWORDS = [
  '動画', 'ショート', 'short', '投稿', '公開', 'アップ',
  '歌ってみた', '踊ってみた', '描いてみた', 'MV',
  'video', 'movie',
];

function detectCategory(text) {
  for (const kw of STREAM_KEYWORDS) {
    if (text.includes(kw)) return '直播预告';
  }
  for (const kw of VIDEO_KEYWORDS) {
    if (text.includes(kw)) return '视频和短视频预告';
  }
  return '日常推文';
}

// ── HTTP 帮助函数 ───────────────────────────────────
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

async function fetchJSON(url, opts = {}) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': UA, ...opts.headers },
    ...opts,
  });
  const text = await resp.text();
  DEBUG_LOG.push(`HTTP ${resp.status} ${url.slice(0, 80)}: ${text.slice(0, 200)}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  try { return JSON.parse(text); } catch { return text; }
}

// ── 方案 A：Nitter 镜像 RSS ──────────────────────────
async function tryNitter(username) {
  const instances = [
    'https://nitter.poast.org',
    'https://xcancel.com',
    'https://nitter.net',
  ];

  for (const base of instances) {
    try {
      const url = `${base}/${username}/rss`;
      DEBUG_LOG.push(`Try Nitter: ${url}`);
      const resp = await fetch(url, {
        headers: { 'User-Agent': UA },
      });
      if (!resp.ok) continue;
      const xml = await resp.text();
      DEBUG_LOG.push(`Nitter RSS: ${xml.slice(0, 300)}`);

      // 解析 RSS XML
      const tweets = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
      while ((match = itemRegex.exec(xml)) !== null && tweets.length < MAX_TWEETS) {
        const item = match[1];
        const title = (item.match(/<title>(.*?)<\/title>/) || [])[1] || '';
        const link = (item.match(/<link>(.*?)<\/link>/) || [])[1] || '';
        const desc = (item.match(/<description>(.*?)<\/description>/) || [])[1] || '';
        const date = (item.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '';
        const id = link.split('/').pop() || '';

        tweets.push({
          id,
          text: title + (desc ? '\n' + cleanHtml(desc) : ''),
          createdAt: date ? new Date(date).toISOString() : new Date().toISOString(),
          likes: 0,
          retweets: 0,
          media: [],
          isRetweet: false,
          retweetSource: null,
        });
      }

      if (tweets.length > 0) {
        DEBUG_LOG.push(`Nitter OK: ${base} → ${tweets.length} tweets`);
        return tweets;
      }
    } catch (err) {
      DEBUG_LOG.push(`Nitter fail ${base}: ${err.message}`);
    }
  }
  return [];
}

// ── 方案 B：fxtwitter API ────────────────────────────
async function tryFxTwitter(username) {
  try {
    // fxtwitter 用户 API
    const url = `https://api.fxtwitter.com/user/${username}`;
    DEBUG_LOG.push(`Try fxtwitter: ${url}`);
    const resp = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    DEBUG_LOG.push(`fxtwitter data keys: ${Object.keys(data||{}).join(', ')}`);

    if (data.tweets && Array.isArray(data.tweets)) {
      return data.tweets.map(t => ({
        id: t.id || '',
        text: t.text || '',
        createdAt: t.created_at || new Date().toISOString(),
        likes: t.likes || 0,
        retweets: t.retweets || 0,
        media: (t.media?.photos || []).map(p => ({ type: 'photo', url: p.url })),
        isRetweet: !!t.retweet,
        retweetSource: t.retweet?.user?.screen_name || null,
      }));
    }
  } catch (err) {
    DEBUG_LOG.push(`fxtwitter fail: ${err.message}`);
  }
  return [];
}

// ── 方案 C：直接 HTML 解析 ───────────────────────────
async function tryHtmlScrape(username) {
  const url = `https://x.com/${username}`;
  DEBUG_LOG.push(`Try HTML scrape: ${url}`);
  const resp = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    },
  });
  const html = await resp.text();

  // 方案 C1：解析 __INITIAL_STATE__
  const initMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});\s*<\/script>/);
  if (initMatch) {
    try {
      const initData = JSON.parse(initMatch[1]);
      DEBUG_LOG.push('Found __INITIAL_STATE__, keys: ' + Object.keys(initData).join(', '));
      const tweets = extractTweetsFromInitState(initData);
      if (tweets.length > 0) {
        DEBUG_LOG.push('Extracted ' + tweets.length + ' tweets from __INITIAL_STATE__');
        return tweets;
      }
    } catch (e) {
      DEBUG_LOG.push('__INITIAL_STATE__ parse fail: ' + e.message);
    }
  } else {
    // 方案 C2：__NEXT_DATA__
    const nextMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
    if (nextMatch) {
      try {
        const data = JSON.parse(nextMatch[1]);
        DEBUG_LOG.push('Found __NEXT_DATA__');
        const tweets = extractTweetsFromInitState(data);
        if (tweets.length > 0) return tweets;
      } catch (e) {
        DEBUG_LOG.push('__NEXT_DATA__ parse fail: ' + e.message);
      }
    }
  }

  DEBUG_LOG.push('No tweet data found in HTML');
  return [];
}

function extractTweetsFromInitState(state) {
  const tweets = [];
  const seen = new Set();

  // 递归搜索所有包含 legacy.full_text 的对象
  function search(obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > 20) return;
    if (Array.isArray(obj)) {
      for (const item of obj) search(item, depth + 1);
      return;
    }
    // 推文特征：有 legacy.full_text
    if (obj.legacy?.full_text && obj.rest_id) {
      const id = obj.rest_id;
      if (!seen.has(id)) {
        seen.add(id);
        tweets.push({
          id,
          text: obj.legacy.full_text,
          createdAt: obj.legacy.created_at || '',
          likes: obj.legacy.favorite_count || 0,
          retweets: obj.legacy.retweet_count || 0,
          media: [],
          isRetweet: !!(obj.legacy.retweeted_status_result),
          retweetSource: obj.legacy.retweeted_status_result?.result?.core?.user_results?.result?.legacy?.screen_name || null,
        });
      }
      return;
    }
    // 扁平化的推文：直接在 full_text 旁
    if (obj.full_text && obj.id_str && obj.user_id_str) {
      const id = obj.id_str;
      if (!seen.has(id)) {
        seen.add(id);
        tweets.push({
          id,
          text: obj.full_text,
          createdAt: obj.created_at || '',
          likes: obj.favorite_count || 0,
          retweets: obj.retweet_count || 0,
          media: [],
          isRetweet: false,
          retweetSource: null,
        });
      }
      return;
    }
    for (const v of Object.values(obj)) search(v, depth + 1);
  }

  search(state, 0);
  DEBUG_LOG.push('Searched state, found ' + tweets.length + ' unique tweets');
  return tweets.slice(0, MAX_TWEETS);
}

function cleanHtml(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

// ── 主流程 ──────────────────────────────────────────
async function main() {
  console.log('🐦 获取 X 推文数据... (@' + TWITTER_USERNAME + ')');

  let tweets = [];

  // 方案 A：Nitter 镜像 RSS（最可靠，返回干净 XML）
  console.log('  尝试 Nitter 镜像 RSS...');
  tweets = await tryNitter(TWITTER_USERNAME);
  if (tweets.length > 0) console.log('  ✅ Nitter: ' + tweets.length + ' 条');

  // 方案 B：fxtwitter API
  if (tweets.length === 0) {
    console.log('  尝试 fxtwitter API...');
    tweets = await tryFxTwitter(TWITTER_USERNAME);
    if (tweets.length > 0) console.log('  ✅ fxtwitter: ' + tweets.length + ' 条');
  }

  // 方案 C：直接 HTML
  if (tweets.length === 0) {
    console.log('  尝试 HTML 直接解析...');
    tweets = await tryHtmlScrape(TWITTER_USERNAME);
    if (tweets.length > 0) console.log('  ✅ HTML: ' + tweets.length + ' 条');
  }

  // 去重 + 过滤转推
  const seen = new Set();
  tweets = tweets.filter(t => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return !t.isRetweet; // 过滤转推
  });

  if (tweets.length === 0) {
    console.warn('⚠️ 未获取到任何推文');
    keepExisting('所有渠道均无推文返回');
    return;
  }

  // 分类 + 格式化
  const classified = tweets.map(t => ({
    id: t.id,
    text: t.text,
    createdAt: t.createdAt,
    category: detectCategory(t.text),
    url: 'https://x.com/' + TWITTER_USERNAME + '/status/' + t.id,
    media: [],
    isRetweet: false,
    retweetSource: null,
    likes: t.likes,
    retweets: t.retweets,
  }));

  const output = {
    lastUpdated: new Date().toISOString(),
    username: TWITTER_USERNAME,
    displayName: '先斗寧',
    tweets: classified,
  };

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');

  const counts = {};
  classified.forEach(t => { counts[t.category] = (counts[t.category] || 0) + 1; });

  console.log('\n✅ 完成！共 ' + classified.length + ' 条推文写入 data/tweets.json');
  console.log('  分类统计: ' + JSON.stringify(counts));
}

function keepExisting(reason) {
  console.warn('  原因: ' + reason);
  DEBUG_LOG.push('keepExisting: ' + reason);
  if (existsSync(OUTPUT_PATH)) {
    try {
      const existing = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
      existing.lastUpdated = new Date().toISOString();
      existing._debug = DEBUG_LOG;
      writeFileSync(OUTPUT_PATH, JSON.stringify(existing, null, 2), 'utf-8');
      console.log('  保留现有 ' + (existing.tweets?.length || 0) + ' 条');
    } catch {
      console.log('  无有效现有数据，跳过');
    }
  }
}

main().catch(err => {
  console.warn('⚠️ 致命错误: ' + err.message);
  DEBUG_LOG.push('FATAL: ' + err.message + '\n' + (err.stack || ''));
  keepExisting('脚本异常: ' + err.message);
  process.exit(0);
});
