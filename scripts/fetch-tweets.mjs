/**
 * Twitter/X 推文数据获取脚本
 * 数据源: rss.app RSS feed
 * 输出: data/tweets.json
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const OUTPUT_PATH = join(DATA_DIR, 'tweets.json');

// rss.app RSS 源
const RSS_URL = 'https://rss.app/feeds/kePnThFX9Zcm8Nuh.xml';
const TWITTER_USERNAME = 'ponto_nei';

// ── 分类关键词 ──────────────────────────────────────
const STREAM_KW = ['配信', '生放送', 'ライブ', 'live', '放送', '枠', '開始', 'スタート', '予定', '今夜', '明日', '本日', '遊びに来て', '見に来て', '待機', 'まもなく'];
const VIDEO_KW = ['動画', 'ショート', 'short', '投稿', '公開', 'アップ', '歌ってみた', '踊ってみた', '描いてみた', 'MV', 'video', 'movie'];

function detectCategory(text) {
  for (const kw of STREAM_KW) if (text.includes(kw)) return '直播预告';
  for (const kw of VIDEO_KW) if (text.includes(kw)) return '视频和短视频预告';
  return '日常推文';
}

// ── RSS 解析 ─────────────────────────────────────────
async function fetchRSS() {
  console.log('🐦 获取 RSS 推文数据... (' + RSS_URL + ')');

  const resp = await fetch(RSS_URL, {
    headers: { 'User-Agent': 'ponto-nei-fansite/1.0' },
  });

  if (!resp.ok) throw new Error('RSS HTTP ' + resp.status);

  const xml = await resp.text();
  console.log('  RSS 大小: ' + xml.length + ' bytes');

  const tweets = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRe.exec(xml)) !== null) {
    const item = match[1];

    const link = extractTag(item, 'link');
    const pubDate = extractTag(item, 'pubDate');

    // 提取推文 ID（从链接 /status/123456 格式）
    const idMatch = link.match(/\/status\/(\d+)/);
    const id = idMatch ? idMatch[1] : '';

    // 使用 title 作为正文
    let title = extractTag(item, 'title');
    title = title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    title = title.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '');

    // 清理 RSS 残留
    title = title.replace(/\s*—\s*\S+\s*@\S+.*$/s, '');
    title = title.trim();

    if (!id || !title) continue;

    let text = title;

    tweets.push({
      id,
      text,
      createdAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      likes: 0,        // RSS 不含互动数据
      retweets: 0,     // RSS 不含互动数据
      media: [],
      isRetweet: false,
      retweetSource: null,
    });
  }

  console.log('  解析: ' + tweets.length + ' 条推文');
  return tweets;
}

function extractTag(xml, tag) {
  const re = new RegExp('<'+tag+'[^>]*>(.*?)<\/'+tag+'>', 's');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

// ── 主流程 ──────────────────────────────────────────
async function main() {
  let tweets = [];

  try {
    tweets = await fetchRSS();
  } catch (err) {
    console.warn('⚠️ RSS 获取失败: ' + err.message);
    console.warn('  保留现有数据不变');
    // 更新 lastUpdated
    if (existsSync(OUTPUT_PATH)) {
      const { readFileSync } = await import('node:fs');
      const existing = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
      existing.lastUpdated = new Date().toISOString();
      writeFileSync(OUTPUT_PATH, JSON.stringify(existing, null, 2), 'utf-8');
    }
    return;
  }

  if (!tweets.length) {
    console.warn('⚠️ RSS 无推文，保留现有数据');
    return;
  }

  // 过滤转推（RT @ 开头）
  tweets = tweets.filter(t => !t.text.startsWith('RT @'));

  // 分类
  const classified = tweets.map(t => ({
    id: t.id,
    text: t.text,
    createdAt: t.createdAt,
    category: detectCategory(t.text),
    url: 'https://x.com/' + TWITTER_USERNAME + '/status/' + t.id,
    media: t.media,
    isRetweet: t.isRetweet,
    retweetSource: t.retweetSource,
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
  console.log('  分类: ' + JSON.stringify(counts));
}

main().catch(err => {
  console.warn('⚠️ 脚本异常: ' + err.message);
  process.exit(0);
});
