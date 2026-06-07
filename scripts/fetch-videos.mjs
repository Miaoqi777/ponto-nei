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

const SERIES_PATTERNS = [
  { regex: /【?(Minecraft|マイクラ|マインクラフト)】?/i, series: 'Minecraft' },
  { regex: /【?(塞尔达|ゼルダ|Zelda|知恵)】?/i, series: '塞尔达传说' },
  { regex: /【?(歌枠|歌ってみた|カラオケ|弾き語り)】?/i, series: '歌枠' },
  { regex: /【?(雑談|フリートーク|近況報告)】?/i, series: '雑談' },
  { regex: /【?(ホラー|怖い|恐怖)】?/i, series: 'ホラーゲーム' },
  { regex: /【?(麻雀|マージャン)】?/i, series: '麻雀' },
  { regex: /【?(APEX|エーペックス)】?/i, series: 'APEX' },
  { regex: /【?(原神|Genshin|げんしん)】?/i, series: '原神' },
  { regex: /【?(崩坏|スターレイル|崩壊)】?/i, series: '崩壊シリーズ' },
  { regex: /【?(スプラ|Splatoon|スプラトゥーン)】?/i, series: 'Splatoon' },
  { regex: /【?(ポケモン|Pok[eé]mon)】?/i, series: 'Pokémon' },
  { regex: /【?(にじさんじ|NIJISANJI|にじヌーン)】?/i, series: 'にじさんじ企画' },
  { regex: /【?(新衣装|お披露目|3D)】?/i, series: '特別企画' },
  { regex: /【?(誕生日|記念|Anniversary|周年)】?/i, series: '記念配信' },
];

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
    return `${d.hours}:${String(d.minutes).padStart(2, '0')}:${String(d.seconds).padStart(2, '0')}`;
  }
  return `${d.minutes}:${String(d.seconds).padStart(2, '0')}`;
}

function detectCategory(video, durationSec) {
  if (durationSec <= 60) return '短视频';
  if (video.liveStreamingDetails?.actualEndTime || durationSec >= 1800) return '录播';
  return '视频';
}

function detectCollaboration(description) {
  if (!description) return { isCollab: false, collaborators: [] };
  const mentions = description.match(/@[\w][\w.-]{2,49}/g) || [];
  const others = [...new Set(mentions)]
    .map(m => m.replace('@', ''))
    .filter(h => !h.toLowerCase().includes('pontonei') && !h.toLowerCase().includes('ponto_nei'));
  return { isCollab: others.length >= 1, collaborators: others };
}

function detectSeries(title, description) {
  const text = (title + ' ' + (description || ''));
  for (const pattern of SERIES_PATTERNS) {
    if (pattern.regex.test(text)) return pattern.series;
  }
  return null;
}

async function getChannelId(handle) {
  const cleanHandle = handle.replace('@', '');
  const url = `${API_BASE}/channels?part=contentDetails,snippet&forHandle=${cleanHandle}&key=${API_KEY}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
  const data = await resp.json();
  if (data.error) throw new Error(`API Error (${data.error.code}): ${data.error.message}`);
  if (!data.items?.length) throw new Error('频道未找到，请检查 handle: ' + handle);
  return {
    id: data.items[0].id,
    title: data.items[0].snippet.title,
    uploadsPlaylistId: data.items[0].contentDetails.relatedPlaylists.uploads,
  };
}

async function getPlaylistItems(playlistId) {
  let items = [];
  let pageToken = null;
  let pages = 0;
  do {
    pages++;
    const url = `${API_BASE}/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=50&key=${API_KEY}${pageToken ? '&pageToken=' + pageToken : ''}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} at page ${pages}`);
    const data = await resp.json();
    if (data.error) throw new Error(`API Error at page ${pages}: ${data.error.message}`);
    items.push(...(data.items || []));
    pageToken = data.nextPageToken;
    console.log(`  第${pages}页: ${data.items?.length || 0} 个视频 (累计 ${items.length})`);
  } while (pageToken);
  return items;
}

async function getVideoDetails(videoIds) {
  const batches = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    batches.push(videoIds.slice(i, i + 50));
  }
  let allVideos = [];
  for (const batch of batches) {
    const ids = batch.join(',');
    const url = `${API_BASE}/videos?part=snippet,contentDetails,statistics,liveStreamingDetails&id=${ids}&maxResults=50&key=${API_KEY}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching video details`);
    const data = await resp.json();
    if (data.error) throw new Error(`API Error fetching details: ${data.error.message}`);
    allVideos.push(...(data.items || []));
  }
  return allVideos;
}

async function main() {
  console.log('🔍 获取频道信息... (handle: ' + YOUTUBE_HANDLE + ')');
  const channel = await getChannelId(YOUTUBE_HANDLE);
  console.log('  频道: ' + channel.title + ' (' + channel.id + ')');

  console.log('📋 获取视频列表...');
  const playlistItems = await getPlaylistItems(channel.uploadsPlaylistId);
  console.log('  共 ' + playlistItems.length + ' 个视频');

  const videoIds = playlistItems.map(item => item.contentDetails.videoId);

  console.log('📊 获取视频详情 (共' + Math.ceil(videoIds.length / 50) + '批次)...');
  const videoDetails = await getVideoDetails(videoIds);
  console.log('  获取了 ' + videoDetails.length + ' 个视频的详情');

  console.log('🏷️ 分类中...');
  const videos = videoDetails.map(video => {
    const { snippet, contentDetails } = video;
    const description = snippet.description || '';
    const durationSec = parseDuration(contentDetails.duration).totalSeconds;
    const category = detectCategory(video, durationSec);
    const collab = detectCollaboration(description);
    const series = detectSeries(snippet.title, description);

    return {
      id: video.id,
      title: snippet.title,
      thumbnail: (snippet.thumbnails?.maxres || snippet.thumbnails?.high || snippet.thumbnails?.medium || snippet.thumbnails?.default)?.url || '',
      publishedAt: snippet.publishedAt,
      durationDisplay: formatDuration(contentDetails.duration),
      category: collab.isCollaboration ? '联动' : category,
      series: series,
      url: 'https://www.youtube.com/watch?v=' + video.id,
      isShort: durationSec <= 60,
      isCollaboration: collab.isCollaboration,
      collaborators: collab.collaborators,
    };
  });

  videos.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  const output = {
    lastUpdated: new Date().toISOString(),
    channelId: channel.id,
    channelTitle: channel.title,
    videos: videos,
  };

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
    console.log('  创建 data/ 目录');
  }

  const outputPath = join(DATA_DIR, 'videos.json');
  writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

  const counts = {};
  videos.forEach(v => { counts[v.category] = (counts[v.category] || 0) + 1; });

  console.log('\n✅ 完成！共 ' + videos.length + ' 个视频写入 data/videos.json');
  console.log('  分类统计: ' + JSON.stringify(counts));
}

main().catch(err => {
  console.error('❌ 错误: ' + err.message);
  console.error('  堆栈: ' + err.stack?.split('\n').slice(0, 3).join('\n'));
  process.exit(1);
});
