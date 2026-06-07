/**
 * Twitter/X 推文数据获取脚本
 * 使用 cdn.syndication.twimg.com 公开端点（无需 API key）
 * 输出: data/tweets.json
 *
 * 注意: syndication 端点不稳定，失败时保留现有数据不变
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

async function getUserId(username) {
  const url = 'https://cdn.syndication.twimg.com/widgets/followbutton/info.json?screen_names=' + username;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const data = await resp.json();
  if (!Array.isArray(data) || !data[0]?.id) throw new Error('Invalid response');
  return data[0].id;
}

async function fetchTimeline(userId) {
  const url = 'https://cdn.syndication.twimg.com/timeline/profile/' + userId + '?suppress_response_codes=true';
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const text = await resp.text();

  try {
    const data = JSON.parse(text);
    const body = data?.body || '';
    // Extract tweets from HTML body
    const tweets = [];
    const tweetRegex = /<li[^>]*class="[^"]*timeline-tweet[^"]*"[^>]*data-tweet-id="(\d+)"[^>]*>/g;
    let match;
    while ((match = tweetRegex.exec(body)) !== null) {
      tweets.push({ id_str: match[1] });
    }

    // Also try JSON embedded data
    if (data?.tweets) tweets.push(...data.tweets.map(t => ({ id_str: t.id_str || t.id })));
    if (data?.items) tweets.push(...data.items.map(t => ({ id_str: t.id_str || t.id })));

    return tweets.map(t => ({
      id: t.id_str || t.id || '',
      text: t.text || t.full_text || t.description || '',
      createdAt: t.created_at || t.date || new Date().toISOString(),
      url: 'https://x.com/' + TWITTER_USERNAME + '/status/' + (t.id_str || t.id),
      media: [],
      isRetweet: !!(t.retweeted_status || t.is_quote_status),
      retweetSource: t.retweeted_status?.user?.screen_name || null,
      likes: t.favorite_count || t.likes || 0,
      retweets: t.retweet_count || t.retweets || 0,
    }));
  } catch {
    return [];
  }
}

async function main() {
  console.log('🐦 获取 Twitter 推文数据... (@' + TWITTER_USERNAME + ')');

  let tweets = [];
  try {
    const userId = await getUserId(TWITTER_USERNAME);
    console.log('  User ID: ' + userId);
    tweets = await fetchTimeline(userId);
    console.log('  获取到 ' + tweets.length + ' 条推文');
  } catch (err) {
    console.warn('⚠️ Syndication 端点不可用: ' + err.message);
    console.warn('  将保留现有数据不变');

    // Check if existing data exists
    if (existsSync(OUTPUT_PATH)) {
      const existing = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
      existing.lastUpdated = new Date().toISOString();
      writeFileSync(OUTPUT_PATH, JSON.stringify(existing, null, 2), 'utf-8');
      console.log('  已更新 lastUpdated，现有 ' + (existing.tweets?.length || 0) + ' 条推文保留');
      process.exit(0);
    }
    console.log('  无现有数据，跳过');
    process.exit(0);
  }

  if (tweets.length === 0) {
    console.warn('⚠️ 未获取到推文，保留现有数据');
    if (existsSync(OUTPUT_PATH)) {
      const existing = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
      existing.lastUpdated = new Date().toISOString();
      writeFileSync(OUTPUT_PATH, JSON.stringify(existing, null, 2), 'utf-8');
    }
    process.exit(0);
  }

  const classified = tweets.map(t => ({ ...t, category: detectCategory(t) }));

  const output = {
    lastUpdated: new Date().toISOString(),
    username: TWITTER_USERNAME,
    displayName: '先斗寧',
    tweets: classified,
  };

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');

  const counts = {};
  classified.forEach(t => { counts[t.category] = (counts[t.category] || 0) + 1; });

  console.log('\n✅ 完成！共 ' + classified.length + ' 条推文写入 data/tweets.json');
  console.log('  分类统计: ' + JSON.stringify(counts));
}

main().catch(err => {
  console.warn('⚠️ 推文获取失败: ' + err.message);
  console.warn('  保留现有数据不变');
  if (existsSync(OUTPUT_PATH)) {
    try {
      const existing = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
      existing.lastUpdated = new Date().toISOString();
      writeFileSync(OUTPUT_PATH, JSON.stringify(existing, null, 2), 'utf-8');
    } catch {}
  }
  process.exit(0); // Never fail the workflow due to Twitter issues
});
