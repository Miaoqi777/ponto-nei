/**
 * Twitter/X 推文数据获取脚本
 * 使用 X API v2（免费套餐，Bearer Token 认证）
 * 环境变量: X_BEARER_TOKEN
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
const API_BASE = 'https://api.x.com/2';

// X API v2 免费限制: 每月100次 GET，每天跑一次消耗2次(ponto_nei)
const MAX_RESULTS = 100; // 每次最多100条，免费套餐够用

const BEARER_TOKEN = process.env.X_BEARER_TOKEN || '';

// 调试信息
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

function detectCategory(tweet) {
  const text = tweet.text || '';
  if (tweet.isRetweet) return '转发直播联动';
  for (const kw of STREAM_KEYWORDS) {
    if (text.includes(kw)) return '直播预告';
  }
  for (const kw of VIDEO_KEYWORDS) {
    if (text.includes(kw)) return '视频和短视频预告';
  }
  return '日常推文';
}

// ── X API v2 请求 ───────────────────────────────────
async function xApi(path) {
  const url = API_BASE + path;
  DEBUG_LOG.push('GET ' + url);
  DEBUG_LOG.push('Token (first 20): ' + BEARER_TOKEN.slice(0, 20) + '...');

  let resp;
  try {
    resp = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + BEARER_TOKEN,
        'User-Agent': 'ponto-nei-fansite/1.0',
      },
    });
  } catch (err) {
    DEBUG_LOG.push('FETCH ERROR: ' + err.message);
    throw err;
  }

  const body = await resp.text();
  DEBUG_LOG.push('HTTP ' + resp.status + ': ' + body.slice(0, 500));

  if (!resp.ok) {
    throw new Error('X API HTTP ' + resp.status + ': ' + body.slice(0, 300));
  }

  return JSON.parse(body);
}

async function getUserId(username) {
  const data = await xApi('/users/by/username/' + username);
  if (!data.data?.id) throw new Error('User not found: ' + username);
  return data.data.id;
}

async function getTweets(userId, paginationToken) {
  let path = '/users/' + userId + '/tweets'
    + '?max_results=' + MAX_RESULTS
    + '&tweet.fields=created_at,public_metrics'
    + '&exclude=retweets,replies';
  if (paginationToken) path += '&pagination_token=' + paginationToken;
  return xApi(path);
}

// ── 主流程 ──────────────────────────────────────────
async function main() {
  console.log('🐦 获取 X 推文数据... (@' + TWITTER_USERNAME + ')');

  if (!BEARER_TOKEN) {
    console.warn('⚠️ 未设置 X_BEARER_TOKEN 环境变量');
    keepExisting('无 API Token');
    return;
  }

  let userId;
  try {
    userId = await getUserId(TWITTER_USERNAME);
    console.log('  User ID: ' + userId);
  } catch (err) {
    console.warn('⚠️ 获取用户 ID 失败: ' + err.message);
    keepExisting('用户查询失败');
    return;
  }

  let allTweets = [];
  let paginationToken = null;
  let pages = 0;

  try {
    do {
      pages++;
      const data = await getTweets(userId, paginationToken);
      const tweets = data.data || [];
      console.log('  第' + pages + '页: ' + tweets.length + ' 条推文');

      for (const t of tweets) {
        const metrics = t.public_metrics || {};
        allTweets.push({
          id: t.id,
          text: t.text || '',
          createdAt: t.created_at || new Date().toISOString(),
          url: 'https://x.com/' + TWITTER_USERNAME + '/status/' + t.id,
          media: [], // 免费 API 不含媒体 URL（需额外 expansions）
          isRetweet: false, // 已 exclude=retweets
          retweetSource: null,
          likes: metrics.like_count || 0,
          retweets: metrics.retweet_count || 0,
        });
      }

      paginationToken = data.meta?.next_token;
    } while (paginationToken && pages < 5); // 最多5页=500条，避免超出月限额

    console.log('  共获取 ' + allTweets.length + ' 条推文');
  } catch (err) {
    console.warn('⚠️ 获取推文失败: ' + err.message);
    keepExisting('推文获取失败');
    return;
  }

  if (allTweets.length === 0) {
    console.warn('⚠️ 未获取到推文');
    keepExisting('无推文返回');
    return;
  }

  // 分类
  const classified = allTweets.map(t => ({ ...t, category: detectCategory(t) }));

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
      console.log('  已更新 lastUpdated，保留现有 ' + (existing.tweets?.length || 0) + ' 条');
    } catch {
      console.log('  无有效现有数据，跳过');
    }
  } else {
    console.log('  无现有数据，跳过');
  }
}

main().catch(err => {
  console.warn('⚠️ 推文获取失败: ' + err.message);
  DEBUG_LOG.push('FATAL: ' + err.message);
  if (existsSync(OUTPUT_PATH)) {
    try {
      const existing = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
      existing.lastUpdated = new Date().toISOString();
      existing._debug = DEBUG_LOG;
      writeFileSync(OUTPUT_PATH, JSON.stringify(existing, null, 2), 'utf-8');
    } catch {}
  }
  process.exit(0);
});
