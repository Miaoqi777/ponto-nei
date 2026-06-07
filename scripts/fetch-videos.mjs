/**
 * YouTube 视频数据获取脚本
 * 使用 YouTube Data API v3
 * 环境变量: YOUTUBE_API_KEY
 * 输出: data/videos.json
 *
 * 运行: node scripts/fetch-videos.mjs
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');

const YOUTUBE_HANDLE = '@PontoNei';
const API_KEY = process.env.YOUTUBE_API_KEY || 'AIzaSyBo7YsK1YBoaRFRM-6t_zsMU9xxTFN2jSU';
const API_BASE = 'https://www.googleapis.com/youtube/v3';

// 系列检测（从前到后匹配，命中即停止）
const SERIES_PATTERNS = [
  { regex: /Minecraft|マイクラ|マインクラフト/i, series: 'Minecraft' },
  { regex: /スプラトゥーン|Splatoon|スプラ/i, series: 'Splatoon' },
  { regex: /ポケモン|Pok[eé]mon/i, series: 'Pokemon' },
  { regex: /マリオカート|マリカ|Mario[ .-]?Kart/i, series: 'Mario Kart' },
  { regex: /(【|#)マリオ|Super[ .-]?Mario/i, series: 'Mario' },
  { regex: /モンハン|モンスターハンター|Monster[ .-]?Hunter/i, series: 'Monster Hunter' },
  { regex: /ファイアーエムブレム|FEエンゲージ|エムブレム|Fire[ .-]?Emblem/i, series: 'Fire Emblem' },
  { regex: /R\.E\.P\.O|REPO/i, series: 'R.E.P.O.' },
  { regex: /ゼルダ|Zelda|知恵のかりもの/i, series: '塞尔达传说' },
  { regex: /あつ森|どうぶつの森|Animal[ .-]?Crossing/i, series: 'Animal Crossing' },
  { regex: /(【|#)ARK[^a-z]|アーク[^a-z]/i, series: 'ARK' },
  { regex: /原神|Genshin|げんしん/i, series: '原神' },
  { regex: /崩壊|スターレイル|スタレ|崩坏/i, series: '崩坏系列' },
  { regex: /APEX|エーペックス/i, series: 'APEX' },
  { regex: /VALORANT|ヴァロラント|バロラント/i, series: 'VALORANT' },
  { regex: /桃鉄|桃太郎電鉄/i, series: '桃鉄' },
  { regex: /スト6|ストリートファイター|Street[ .-]?Fighter/i, series: 'Street Fighter' },
  { regex: /スマブラ|大乱闘|Smash[ .-]?Bros/i, series: '大乱斗Smash Bros' },
  { regex: /Among[ .-]?Us|アモングアス/i, series: 'Among Us' },
  { regex: /Identity[ .-]?V|第五人格|アイデンティティ/i, series: 'Identity V' },
  { regex: /歌枠|歌ってみた|カラオケ|弾き語り|#Cover/i, series: '歌枠' },
  { regex: /雑談|フリートーク|近況報告|おしゃべり/i, series: '雑談' },
  { regex: /麻雀|マージャン/i, series: '麻雀' },
  { regex: /【ホラー|#ホラー|怖い話|恐怖ゲーム/i, series: '恐怖游戏' },
  { regex: /TRPG|クトゥルフ|CoC/i, series: 'TRPG' },
  { regex: /新衣装|お披露目|3Dお披露目/i, series: '特别企画' },
  { regex: /誕生日|記念配信|Anniversary|周年|デビュー.*周年/i, series: '纪念配信' },
  { regex: /にじフェス|にじヌーン|にじさんじ甲子園|にじGTA|にじ歌謡祭/i, series: 'NIJISANJI大型企画' },
];

// 联动检测：排除常见的非联动 @mention（官方号、画师、音乐人等）
const COLLAB_BLACKLIST = new Set([
  'nijisanji', 'nijisanji_app', 'nijisanji_official', 'nijisanji_world',
  'anycolor_inc', 'anycolor_info',
  'pontonei', 'ponto_nei',
  'youtube', 'youtubemusic', 'twitter', 'x',
  'nishikikope', '322_ovo',  // 画师/设计师
]);

// 联动标题关键词
const COLLAB_TITLE_WORDS = ['コラボ', '連合', 'コラボ配信', ' × ', ' vs ', ' with ', 'コラボ企画'];

function parseDuration(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return { hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 };
  const h = parseInt(m[1] || '0');
  const min = parseInt(m[2] || '0');
  const s = parseInt(m[3] || '0');
  return { hours: h, minutes: min, seconds: s, totalSeconds: h * 3600 + min * 60 + s };
}

function formatDuration(iso) {
  const d = parseDuration(iso);
  if (d.hours > 0) {
    return d.hours + ':' + String(d.minutes).padStart(2, '0') + ':' + String(d.seconds).padStart(2, '0');
  }
  return d.minutes + ':' + String(d.seconds).padStart(2, '0');
}

function detectBaseCategory(video, durationSec) {
  if (durationSec <= 60) return '短视频';
  if (video.liveStreamingDetails?.actualEndTime || durationSec >= 1800) return '录播';
  return '视频';
}

function detectCollaboration(description, title) {
  if (!description && !title) return { isCollab: false, collaborators: [] };

  const desc = (description || '');
  const t = (title || '');

  // 从描述中提取 @mentions
  const mentions = desc.match(/@[\w][\w.-]{2,49}/g) || [];
  const filtered = [...new Set(mentions)]
    .map(function(m) { return m.replace('@', ''); })
    .filter(function(h) { return !COLLAB_BLACKLIST.has(h.toLowerCase()); });

  // 从标题中检测联动关键词
  const hasCollabKeyword = COLLAB_TITLE_WORDS.some(function(kw) { return t.includes(kw); });

  // 真正的联动：至少过滤后有1个 @mention 且有联动关键词，或至少2个 @mention
  const isCollab = (filtered.length >= 1 && hasCollabKeyword) || filtered.length >= 2;

  return {
    isCollab: isCollab,
    collaborators: isCollab ? filtered : [],
  };
}

function detectSeries(title, description) {
  var text = (title + ' ' + (description || ''));
  for (var i = 0; i < SERIES_PATTERNS.length; i++) {
    if (SERIES_PATTERNS[i].regex.test(text)) {
      return SERIES_PATTERNS[i].series;
    }
  }
  return null;
}

async function getChannelId(handle) {
  var cleanHandle = handle.replace('@', '');
  var url = API_BASE + '/channels?part=contentDetails,snippet&forHandle=' + cleanHandle + '&key=' + API_KEY;
  var resp = await fetch(url);
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + resp.statusText);
  var data = await resp.json();
  if (data.error) throw new Error('API Error (' + data.error.code + '): ' + data.error.message);
  if (!data.items || !data.items.length) throw new Error('频道未找到: ' + handle);
  return {
    id: data.items[0].id,
    title: data.items[0].snippet.title,
    uploadsPlaylistId: data.items[0].contentDetails.relatedPlaylists.uploads,
  };
}

async function getPlaylistItems(playlistId) {
  var items = [];
  var pageToken = null;
  var pages = 0;
  do {
    pages++;
    var url = API_BASE + '/playlistItems?part=snippet,contentDetails&playlistId=' + playlistId + '&maxResults=50&key=' + API_KEY + (pageToken ? '&pageToken=' + pageToken : '');
    var resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ' at page ' + pages);
    var data = await resp.json();
    if (data.error) throw new Error('API Error at page ' + pages + ': ' + data.error.message);
    items.push.apply(items, data.items || []);
    pageToken = data.nextPageToken;
    console.log('  第' + pages + '页: ' + (data.items ? data.items.length : 0) + ' 个视频 (累计 ' + items.length + ')');
  } while (pageToken);
  return items;
}

async function getVideoDetails(videoIds) {
  var batches = [];
  for (var i = 0; i < videoIds.length; i += 50) {
    batches.push(videoIds.slice(i, i + 50));
  }
  var allVideos = [];
  for (var b = 0; b < batches.length; b++) {
    var ids = batches[b].join(',');
    var url = API_BASE + '/videos?part=snippet,contentDetails,statistics,liveStreamingDetails&id=' + ids + '&maxResults=50&key=' + API_KEY;
    var resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ' fetching video details');
    var data = await resp.json();
    if (data.error) throw new Error('API Error fetching details: ' + data.error.message);
    allVideos.push.apply(allVideos, data.items || []);
  }
  return allVideos;
}

async function main() {
  console.log('获取频道信息... (handle: ' + YOUTUBE_HANDLE + ')');
  var channel = await getChannelId(YOUTUBE_HANDLE);
  console.log('  频道: ' + channel.title + ' (' + channel.id + ')');

  console.log('获取视频列表...');
  var playlistItems = await getPlaylistItems(channel.uploadsPlaylistId);
  console.log('  共 ' + playlistItems.length + ' 个视频');

  var videoIds = playlistItems.map(function(item) { return item.contentDetails.videoId; });

  console.log('获取视频详情 (共' + Math.ceil(videoIds.length / 50) + '批次)...');
  var videoDetails = await getVideoDetails(videoIds);
  console.log('  获取了 ' + videoDetails.length + ' 个视频的详情');

  console.log('分类中...');
  var videos = videoDetails.map(function(video) {
    var snippet = video.snippet;
    var contentDetails = video.contentDetails;
    var description = snippet.description || '';
    var title = snippet.title || '';
    var durationSec = parseDuration(contentDetails.duration).totalSeconds;
    var baseCategory = detectBaseCategory(video, durationSec);
    var collab = detectCollaboration(description, title);
    var series = detectSeries(title, description);
    var finalCategory = collab.isCollaboration ? '联动' : baseCategory;

    return {
      id: video.id,
      title: title,
      thumbnail: (snippet.thumbnails.maxres || snippet.thumbnails.high || snippet.thumbnails.medium || snippet.thumbnails.default || {}).url || '',
      publishedAt: snippet.publishedAt,
      durationDisplay: formatDuration(contentDetails.duration),
      category: finalCategory,
      series: series,
      url: 'https://www.youtube.com/watch?v=' + video.id,
      isShort: durationSec <= 60,
      isCollaboration: collab.isCollaboration,
      collaborators: collab.collaborators,
    };
  });

  videos.sort(function(a, b) { return new Date(b.publishedAt) - new Date(a.publishedAt); });

  var output = {
    lastUpdated: new Date().toISOString(),
    channelId: channel.id,
    channelTitle: channel.title,
    videos: videos,
  };

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
    console.log('  创建 data/ 目录');
  }

  var outputPath = join(DATA_DIR, 'videos.json');
  writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

  var counts = {};
  var seriesCounts = {};
  videos.forEach(function(v) {
    counts[v.category] = (counts[v.category] || 0) + 1;
    var s = v.series || '(未分组)';
    seriesCounts[s] = (seriesCounts[s] || 0) + 1;
  });

  console.log('\n完成！共 ' + videos.length + ' 个视频写入 data/videos.json');
  console.log('  分类统计: ' + JSON.stringify(counts));
  console.log('  系列数: ' + Object.keys(seriesCounts).length);
}

main().catch(function(err) {
  console.error('错误: ' + err.message);
  console.error('  堆栈: ' + (err.stack || '').split('\n').slice(0, 3).join('\n'));
  process.exit(1);
});
