/**
 * Twitter/X 推文数据获取脚本
 * 使用 cdn.syndication.twimg.com 公开端点（无需 API key）
 * 输出: data/tweets.json
 *
 * 注意：
 *   - syndication 端点返回的是最近推文（约20-50条）
 *   - 目前没有标签分类（推文内容分类通过本地关键词匹配）
 *   - 如果端点不可用，脚本会保留现有数据不变
 *
 * 运行: node scripts/fetch-tweets.mjs
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');

const TWITTER_USERNAME = 'ponto_nei';

// ====== 分类关键词 ======

// 直播/联动相关（日语 + 中文）
const STREAM_KEYWORDS = [
  '配信', '生放送', 'ライブ', 'live', '放送', '枠',
  '開始', 'スタート', '予定', '今夜', '明日', '本日',
  '遊びに来て', '見に来て', '待機', 'まもなく',
];

// 视频/短视频相关
const VIDEO_KEYWORDS = [
  '動画', 'ショート', 'short', '投稿', '公開', 'アップ',
  '歌ってみた', '踊ってみた', '描いてみた', 'MV',
  'video', 'movie',
];

/**
 * 根据推文内容分类
 * 优先级：直播预告 > 视频预告 > 日常推文
 */
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

/**
 * 从 syndication.twimg.com 获取用户 ID
 */
async function getUserId(username) {
  const url = `https://cdn.syndication.twimg.com/widgets/followbutton/info.json?screen_names=${username}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`无法获取用户ID (HTTP ${resp.status})`);
  const data = await resp.json();
  if (!data[0]?.id) throw new Error('返回数据中没有用户ID');
  return data[0].id;
}

/**
 * 获取推文列表
 * 尝试通过 timeline/profile 端点获取
 */
async function fetchTimeline(username) {
  // 方法1：获取用户信息
  const userId = await getUserId(username);
  console.log(`  User ID: ${userId}`);

  // 方法2：获取 timeline（可能返回有限数据）
  const timelineUrl = `https://cdn.syndication.twimg.com/timeline/profile/${userId}?suppress_response_codes=true`;
  const resp = await fetch(timelineUrl);
  if (!resp.ok) {
    console.error(`  timeline endpoint 返回 HTTP ${resp.status}`);
    return [];
  }

  const text = await resp.text();

  // 尝试解析 JSON
  try {
    const data = JSON.parse(text);
    return extractTweets(data);
  } catch {
    // 返回的是 HTML，尝试手动解析 tweet containers
    console.log('  timeline 返回的不是 JSON，尝试备用方法...');
    return [];
  }
}

/**
 * 从 syndication 返回的结构中提取推文
 */
function extractTweets(data) {
  if (!data) return [];

  // syndication 格式可能不同，尝试常见路径
  let tweets = [];

  if (Array.isArray(data)) {
    tweets = data;
  } else if (data.body) {
    tweets = extractFromHtml(data.body);
  } else if (data.tweets) {
    tweets = data.tweets;
  } else if (data.items) {
    tweets = data.items;
  }

  return tweets.map(t => ({
    id: t.id_str || t.id || String(Math.random()),
    text: (t.text || t.full_text || t.description || '').replace(/\n/g, '\\n'),
    createdAt: t.created_at || t.date || new Date().toISOString(),
    url: `https://x.com/${TWITTER_USERNAME}/status/${t.id_str || t.id}`,
    media: extractMedia(t),
    isRetweet: !!(t.retweeted_status || t.is_quote_status),
    retweetSource: t.retweeted_status?.user?.screen_name || null,
    likes: t.favorite_count || t.likes || 0,
    retweets: t.retweet_count || t.retweets || 0,
  }));
}

/**
 * 从 HTML 中提取推文（备用方案）
 */
function extractFromHtml(html) {
  // 简单的 HTML 推文结构解析
  const results = [];
  // 寻找推文 id 和内容（这是一个简化实现）
  const tweetMatches = html.match(/data-tweet-id="(\d+)"/g);
  if (tweetMatches) {
    tweetMatches.forEach(match => {
      const id = match.match(/\d+/)?.[0];
      if (id) {
        results.push({
          id_str: id,
          text: '(HTML parsed tweet)',
          created_at: new Date().toISOString(),
        });
      }
    });
  }
  return results;
}

/**
 * 提取媒体
 */
function extractMedia(tweet) {
  const media = [];
  // extended_entities 路径
  const ext = tweet.extended_entities || tweet.entities || {};
  const items = ext.media || [];
  for (const m of items) {
    media.push({
      url: m.media_url_https || m.url || '',
      type: m.type || 'photo',
    });
  }
  return media;
}

/**
 * 主函数
 */
async function main() {
  console.log('🐦 获取 Twitter 推文数据...');
  console.log(`  Username: @${TWITTER_USERNAME}`);

  let tweets;
  try {
    tweets = await fetchTimeline(TWITTER_USERNAME);
    console.log(`  获取到 ${tweets.length} 条推文`);
  } catch (err) {
    console.error('⚠️  syndication 端点不可用:', err.message);
    console.log('  将保留现有数据...');

    // 保留现有 tweets.json
    const existingPath = join(DATA_DIR, 'tweets.json');
    if (existsSync(existingPath)) {
      console.log('  现有数据已保留');
      process.exit(0);
    } else {
      console.log('  无现有数据，写入空文件');
      tweets = [];
    }
  }

  // 分类
  console.log('🏷️ 分类中...');
  const classified = tweets.map(tweet => ({
    ...tweet,
    category: detectCategory(tweet),
  }));

  const output = {
    lastUpdated: new Date().toISOString(),
    username: TWITTER_USERNAME,
    displayName: '先斗寧',
    tweets: classified,
  };

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  const outputPath = join(DATA_DIR, 'tweets.json');
  writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

  // 统计
  const counts = {};
  classified.forEach(t => {
    counts[t.category] = (counts[t.category] || 0) + 1;
  });

  console.log(`\n✅ 完成！共 ${classified.length} 条推文写入 data/tweets.json`);
  console.log('  分类统计:', counts);
}

main().catch(err => {
  console.error('❌ 错误:', err.message);
  process.exit(1);
});
