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

// ── Guest Token ──────────────────────────────────────
async function getGuestToken() {
  const data = await fetchJSON('https://api.x.com/1.1/guest/activate.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (data.guest_token) return data.guest_token;
  throw new Error('No guest token');
}

// ── GraphQL 请求 ─────────────────────────────────────
async function graphql(opName, feature, variables, guestToken) {
  const url = `https://x.com/i/api/graphql/${opName}/${feature}?variables=${encodeURIComponent(JSON.stringify(variables))}`;
  return fetchJSON(url, {
    headers: {
      'Authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
      'X-Guest-Token': guestToken,
      'Cookie': `guest_id=v1%3A${Date.now()}; guest_id_marketing=v1%3A${Date.now()}; guest_id_ads=v1%3A${Date.now()}`,
    },
  });
}

// ── 用户查询 ─────────────────────────────────────────
const USER_BY_SCREEN_NAME_OPS = [
  ['G3KGOASz96M-Qu1nUsG4nA', 'UserByScreenName'],
  ['Yka-W8dz7RaEuQMNkroPkQ', 'UserByScreenName'],
  ['k5XapwcSikNsEsILW5FvgA', 'UserByScreenName'],
  ['7HtBq3IhGFGjBXTjG6z4BA', 'UserByScreenName'],
];

async function getUserId(username, guestToken) {
  for (const [op, feature] of USER_BY_SCREEN_NAME_OPS) {
    try {
      const data = await graphql(op, feature, {
        screen_name: username,
        withSafetyModeUserFields: true,
      }, guestToken);
      if (data?.data?.user?.result?.rest_id) {
        DEBUG_LOG.push(`UserByScreenName OK op=${op}`);
        return {
          id: data.data.user.result.rest_id,
          name: data.data.user.result.legacy?.name || username,
        };
      }
    } catch { /* try next */ }
  }
  throw new Error('All UserByScreenName ops failed');
}

// ── 推文列表 ─────────────────────────────────────────
const USER_TWEETS_OPS = [
  ['8IS8MaO-2f6o2iGdQKPkdQ', 'UserTweets'],
  ['E3opETHvvHwWU7O6sm-ugA', 'UserTweets'],
  ['V7H4fLq8tU8RS4wGj6t1lw', 'UserTweets'],
  ['9zyyd1hebl7oVBBjH1e6I', 'UserTweets'],
  ['I4Mr4xVqkpGghI4RpXmKCA', 'UserTweets'],
];

async function getUserTweets(userId, guestToken, cursor) {
  const vars = {
    userId,
    count: 20,
    includePromotedContent: false,
    withQuickPromoteEligibilityTweetFields: false,
    withVoice: false,
    withV2Timeline: false,
  };
  if (cursor) vars.cursor = cursor;

  for (const [op, feature] of USER_TWEETS_OPS) {
    try {
      const data = await graphql(op, feature, vars, guestToken);
      const entries = data?.data?.user?.result?.timeline_v2?.timeline?.instructions?.[0]?.entries
        || data?.data?.user?.result?.timeline?.timeline?.instructions?.[0]?.entries
        || [];

      if (entries.length > 0) {
        DEBUG_LOG.push(`UserTweets OK op=${op} entries=${entries.length}`);
        const tweets = [];
        let nextCursor = null;

        for (const entry of entries) {
          const content = entry.content?.itemContent?.tweet_results?.result
            || entry.content?.tweetResult?.result
            || entry.content?.tweet?.result;
          if (!content) continue;
          const legacy = content.legacy || content.tweet?.legacy || {};
          if (!legacy.full_text) continue;

          tweets.push({
            id: content.rest_id || legacy.id_str || '',
            text: legacy.full_text || '',
            createdAt: legacy.created_at || '',
            likes: legacy.favorite_count || 0,
            retweets: legacy.retweet_count || 0,
            isRetweet: !!(legacy.retweeted_status_result),
            retweetSource: legacy.retweeted_status_result?.result?.core?.user_results?.result?.legacy?.screen_name || null,
          });

          // 检查翻页
          if (entry.content?.value || entry.content?.cursorType === 'Bottom') {
            nextCursor = entry.content?.value || null;
          }
        }

        return { tweets, nextCursor, entries };
      }
    } catch { /* try next */ }
  }
  throw new Error('All UserTweets ops failed');
}

// ── HTML 回退方案：解析 X 个人主页 ───────────────────
async function scrapeProfileHtml(username) {
  const url = `https://x.com/${username}`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  const html = await resp.text();
  DEBUG_LOG.push(`Profile HTML: ${html.slice(0, 500)}`);

  // 尝试提取 __NEXT_DATA__ 或 embedded JSON
  const scriptMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
  if (scriptMatch) {
    try {
      const nextData = JSON.parse(scriptMatch[1]);
      DEBUG_LOG.push('Found __NEXT_DATA__');
      return nextData;
    } catch {}
  }

  // 尝试提取 tweets 相关的 JSON
  const tweetsMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});/s);
  if (tweetsMatch) {
    try {
      return JSON.parse(tweetsMatch[1]);
    } catch {}
  }

  throw new Error('Could not parse profile HTML');
}

// ── 主流程 ──────────────────────────────────────────
async function main() {
  console.log('🐦 获取 X 推文数据... (@' + TWITTER_USERNAME + ')');

  // 方案 A：GraphQL Guest Token
  let guestToken;
  try {
    guestToken = await getGuestToken();
    console.log('  Guest Token: OK');
  } catch (err) {
    console.warn('  ⚠️ Guest Token 失败: ' + err.message);
  }

  let tweets = [];

  if (guestToken) {
    try {
      const user = await getUserId(TWITTER_USERNAME, guestToken);
      console.log('  User: ' + user.name + ' (' + user.id + ')');

      let cursor = null, pages = 0;
      do {
        pages++;
        const result = await getUserTweets(user.id, guestToken, cursor);
        tweets.push(...result.tweets);
        cursor = result.nextCursor;
        console.log('  第' + pages + '页: ' + result.tweets.length + ' 条 (累计' + tweets.length + ')');
      } while (cursor && tweets.length < MAX_TWEETS);

    } catch (err) {
      console.warn('  ⚠️ GraphQL 抓取失败: ' + err.message);
    }
  }

  // 方案 B：HTML 回退
  if (tweets.length === 0) {
    console.log('  尝试 HTML 回退...');
    try {
      const profileData = await scrapeProfileHtml(TWITTER_USERNAME);
      // 从 profile HTML 中提取推文
      DEBUG_LOG.push('HTML fallback data keys: ' + Object.keys(profileData || {}).join(', '));
    } catch (err) {
      console.warn('  ⚠️ HTML 回退失败: ' + err.message);
    }
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
