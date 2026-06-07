/**
 * Twitter/X 推文数据获取脚本
 * 多方案备选：RSSHub → X.com GraphQL (guest cookie) → Nitter RSS
 * 输出: data/tweets.json
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
const STREAM_KW = ['配信', '生放送', 'ライブ', 'live', '放送', '枠', '開始', 'スタート', '予定', '今夜', '明日', '本日', '遊びに来て', '見に来て', '待機', 'まもなく'];
const VIDEO_KW = ['動画', 'ショート', 'short', '投稿', '公開', 'アップ', '歌ってみた', '踊ってみた', '描いてみた', 'MV', 'video', 'movie'];

function detectCategory(text) {
  for (const kw of STREAM_KW) if (text.includes(kw)) return '直播预告';
  for (const kw of VIDEO_KW) if (text.includes(kw)) return '视频和短视频预告';
  return '日常推文';
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// ── 方案 A：RSSHub 公共实例 ─────────────────────────
async function tryRssHub(username) {
  const urls = [
    `https://rsshub.app/twitter/user/${username}`,
    `https://rsshub.rssforever.com/twitter/user/${username}`,
    `https://rss.shab.fun/twitter/user/${username}`,
  ];
  for (const url of urls) {
    try {
      DEBUG_LOG.push('Try RSSHub: ' + url);
      const resp = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml, application/xml, */*' } });
      if (!resp.ok) { DEBUG_LOG.push('RSSHub HTTP ' + resp.status); continue; }
      const xml = await resp.text();
      const tweets = parseRSS(xml);
      if (tweets.length > 0) { DEBUG_LOG.push('RSSHub OK: ' + tweets.length + ' tweets'); return tweets; }
    } catch (e) { DEBUG_LOG.push('RSSHub fail: ' + e.message); }
  }
  return [];
}

function parseRSS(xml) {
  const tweets = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null && tweets.length < MAX_TWEETS) {
    const item = m[1];
    const title = (item.match(/<title>(.*?)<\/title>/) || [])[1] || '';
    const link = (item.match(/<link>(.*?)<\/link>/) || [])[1] || '';
    const desc = (item.match(/<description>(.*?)<\/description>/) || [])[1] || '';
    const date = (item.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '';
    const id = link.split('/').filter(Boolean).pop() || '';
    tweets.push({ id, text: title + (desc ? '\n' + cleanRss(desc) : ''), createdAt: date ? new Date(date).toISOString() : new Date().toISOString(), likes: 0, retweets: 0, media: [], isRetweet: false, retweetSource: null });
  }
  return tweets;
}

function cleanRss(s) { return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'); }

// ── 方案 B：X.com GraphQL (guest cookie) ────────────
async function tryXGraphQL(username) {
  let cookies = '';

  // Step 1: 访问首页获取 cookies
  try {
    DEBUG_LOG.push('Fetch x.com homepage for cookies...');
    const resp = await fetch('https://x.com/', { headers: { 'User-Agent': UA } });
    const setCookie = resp.headers.get('set-cookie') || '';
    // 提取 guest_id
    const guestMatch = setCookie.match(/guest_id=([^;]+)/);
    const guestId = guestMatch ? guestMatch[1] : 'v1%3A' + Date.now();
    cookies = `guest_id=${guestId}; guest_id_marketing=${guestId}; guest_id_ads=${guestId};`;
    DEBUG_LOG.push('Got guest_id cookie');
  } catch (e) {
    DEBUG_LOG.push('Homepage fetch fail: ' + e.message);
    cookies = `guest_id=v1%3A${Date.now()}`;
  }

  // Step 2: 获取 guest token
  let guestToken = '';
  try {
    const resp = await fetch('https://api.x.com/1.1/guest/activate.json', {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Cookie': cookies, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: '',
    });
    const data = await resp.json();
    if (data.guest_token) { guestToken = data.guest_token; DEBUG_LOG.push('Guest token OK'); }
    else { DEBUG_LOG.push('Guest token fail: ' + JSON.stringify(data).slice(0, 100)); }
  } catch (e) { DEBUG_LOG.push('Guest activate fail: ' + e.message); }

  if (!guestToken) return [];

  // Step 3: UserByScreenName → user ID
  let userId = '';
  const userOps = [{ op: 'G3KGOASz96M-Qu1nUsG4nA', f: 'UserByScreenName' }];
  for (const {op, f} of userOps) {
    try {
      const url = `https://x.com/i/api/graphql/${op}/${f}?variables=${encodeURIComponent(JSON.stringify({screen_name:username,withSafetyModeUserFields:true}))}`;
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Cookie': cookies, 'X-Guest-Token': guestToken, 'Authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA', 'X-Twitter-Active-User': 'yes', 'X-Twitter-Client-Language': 'en' } });
      const d = await r.json();
      userId = d?.data?.user?.result?.rest_id;
      if (userId) { DEBUG_LOG.push('User ID: ' + userId); break; }
    } catch (e) {}
  }
  if (!userId) { DEBUG_LOG.push('UserByScreenName all failed'); return []; }

  // Step 4: UserTweets
  const tweets = [];
  const tweetOps = [{ op: '8IS8MaO-2f6o2iGdQKPkdQ', f: 'UserTweets' }, { op: 'E3opETHvvHwWU7O6sm-ugA', f: 'UserTweets' }];
  for (const {op, f} of tweetOps) {
    try {
      const url = `https://x.com/i/api/graphql/${op}/${f}?variables=${encodeURIComponent(JSON.stringify({userId,count:20,includePromotedContent:false,withQuickPromoteEligibilityTweetFields:false,withVoice:false,withV2Timeline:false}))}`;
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Cookie': cookies, 'X-Guest-Token': guestToken, 'Authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA', 'X-Twitter-Active-User': 'yes', 'X-Twitter-Client-Language': 'en' } });
      const d = await r.json();
      DEBUG_LOG.push('UserTweets response: ' + JSON.stringify(d).slice(0, 300));
      const entries = d?.data?.user?.result?.timeline_v2?.timeline?.instructions?.[0]?.entries || [];
      for (const e of entries) {
        const c = e.content?.itemContent?.tweet_results?.result || e.content?.tweetResult?.result;
        if (!c?.legacy?.full_text) continue;
        const l = c.legacy;
        tweets.push({ id: c.rest_id, text: l.full_text, createdAt: l.created_at, likes: l.favorite_count || 0, retweets: l.retweet_count || 0, media: [], isRetweet: !!(l.retweeted_status_result), retweetSource: l.retweeted_status_result?.result?.core?.user_results?.result?.legacy?.screen_name || null });
      }
      if (tweets.length > 0) { DEBUG_LOG.push('GraphQL OK: ' + tweets.length + ' tweets'); break; }
    } catch (e) { DEBUG_LOG.push('UserTweets fail: ' + e.message); }
  }
  return tweets;
}

// ── 方案 C：Nitter 镜像 ─────────────────────────────
async function tryNitter(username) {
  for (const base of ['https://nitter.poast.org', 'https://xcancel.com']) {
    try {
      const url = `${base}/${username}/rss`;
      DEBUG_LOG.push('Try Nitter: ' + url);
      const resp = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!resp.ok) continue;
      const xml = await resp.text();
      const tweets = parseRSS(xml);
      if (tweets.length > 0) { DEBUG_LOG.push('Nitter OK: ' + tweets.length); return tweets; }
    } catch (e) {}
  }
  return [];
}

// ── 主流程 ──────────────────────────────────────────
async function main() {
  console.log('🐦 获取 X 推文数据... (@' + TWITTER_USERNAME + ')');

  let tweets = [];

  // A: RSSHub
  console.log('  尝试 RSSHub...');
  tweets = await tryRssHub(TWITTER_USERNAME);
  if (tweets.length) console.log('  ✅ RSSHub: ' + tweets.length + ' 条');

  // B: X.com GraphQL
  if (!tweets.length) {
    console.log('  尝试 X GraphQL...');
    tweets = await tryXGraphQL(TWITTER_USERNAME);
    if (tweets.length) console.log('  ✅ GraphQL: ' + tweets.length + ' 条');
  }

  // C: Nitter
  if (!tweets.length) {
    console.log('  尝试 Nitter...');
    tweets = await tryNitter(TWITTER_USERNAME);
    if (tweets.length) console.log('  ✅ Nitter: ' + tweets.length + ' 条');
  }

  // 去重 + 过滤转推
  const seen = new Set();
  tweets = tweets.filter(t => { if (seen.has(t.id) || t.isRetweet) return false; seen.add(t.id); return true; });

  if (!tweets.length) { console.warn('⚠️ 所有渠道均无推文返回'); keepExisting('all failed'); return; }

  const classified = tweets.map(t => ({
    id: t.id, text: t.text, createdAt: t.createdAt,
    category: detectCategory(t.text),
    url: 'https://x.com/' + TWITTER_USERNAME + '/status/' + t.id,
    media: t.media || [], isRetweet: false, retweetSource: null,
    likes: t.likes, retweets: t.retweets,
  }));

  const output = { lastUpdated: new Date().toISOString(), username: TWITTER_USERNAME, displayName: '先斗寧', tweets: classified };
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');

  const counts = {};
  classified.forEach(t => { counts[t.category] = (counts[t.category] || 0) + 1; });
  console.log('\n✅ 完成！共 ' + classified.length + ' 条推文');
  console.log('  分类: ' + JSON.stringify(counts));
}

function keepExisting(reason) {
  console.warn('  原因: ' + reason);
  DEBUG_LOG.push('keepExisting: ' + reason);
  if (existsSync(OUTPUT_PATH)) {
    try {
      const ex = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
      ex.lastUpdated = new Date().toISOString();
      ex._debug = DEBUG_LOG;
      writeFileSync(OUTPUT_PATH, JSON.stringify(ex, null, 2), 'utf-8');
    } catch {}
  }
}

main().catch(err => {
  DEBUG_LOG.push('FATAL: ' + err.message);
  keepExisting('exception');
  process.exit(0);
});
