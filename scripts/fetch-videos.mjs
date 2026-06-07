/**
 * YouTube 视频数据获取脚本
 * 使用 YouTube Data API v3
 * 需要环境变量: YOUTUBE_API_KEY（或直接在下方填入）
 * 输出: data/videos.json
 *
 * 运行: node scripts/fetch-videos.mjs
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');

// ====== 配置 ======
const YOUTUBE_HANDLE = '@PontoNei';
const API_KEY = process.env.YOUTUBE_API_KEY || 'AIzaSyBo7YsK1YBoaRFRM-6t_zsMU9xxTFN2jSU';
const API_BASE = 'https://www.googleapis.com/youtube/v3';

// 游戏/系列关键词映射
const SERIES_PATTERNS = [
  { regex: /【?(Minecraft|マイクラ|マインクラフト)】?/i, series: 'Minecraft' },
  { regex: /【?(塞尔达|ゼルダ|Zelda|知恵のかりもの)】?/i, series: '塞尔达传说' },
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

// 已知 VTuber 频道 @handle 列表（用于联动检测）
const KNOWN_VTUBERS = [
  // Ranunculus 同期
  'amagamemuyu', 'umiseyotsuha',
  // 其他常见联动对象（可根据需要扩充）
];

/**
 * 从 ISO 8601 duration 解析秒数
 */
function parseDuration(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const h = parseInt(m[1] || '0');
  const min = parseInt(m[2] || '0');
  const s = parseInt(m[3] || '0');
  return { hours: h, minutes: min, seconds: s, totalSeconds: h * 3600 + min * 60 + s };
}

/**
 * ISO 8601 duration → 显示格式 (1:23:45 / 0:45 / 3:00:00)
 */
function formatDuration(iso) {
  const d = parseDuration(iso);
  if (d.hours > 0) {
    return `${d.hours}:${String(d.minutes).padStart(2, '0')}:${String(d.seconds).padStart(2, '0')}`;
  }
  return `${d.minutes}:${String(d.seconds).padStart(2, '0')}`;
}

/**
 * 检测视频分类
 */
function detectCategory(video) {
  const { contentDetails, liveStreamingDetails } = video;
  const durationSec = parseDuration(contentDetails.duration).totalSeconds;

  // 短视频：≤60 秒
  if (durationSec <= 60) return '短视频';

  // 录播：duration ≥ 30分钟 或 有直播详情
  if (liveStreamingDetails?.actualEndTime || durationSec >= 1800) return '录播';

  return '视频';
}

/**
 * 检测联动和协作者
 */
function detectCollaboration(description) {
  if (!description) return { isCollab: false, collaborators: [] };
  const mentions = description.match(/@[\w][\w.-]{2,49}/g) || [];
  // 过滤掉自己的 handle
  const others = [...new Set(mentions)]
    .map(m => m.replace('@', ''))
    .filter(h => !h.toLowerCase().includes('pontonei') && !h.toLowerCase().includes('ponto_nei'));
  return {
    isCollab: others.length >= 1,
    collaborators: others,
  };
}

/**
 * 从视频标题检测系列
 */
function detectSeries(title, description) {
  const text = (title + ' ' + (description || ''));
  for (const pattern of SERIES_PATTERNS) {
    if (pattern.regex.test(text)) return pattern.series;
  }
  return null;
}

/**
 * 通过 handle 获取频道 ID
 */
async function getChannelId(handle) {
  const cleanHandle = handle.replace('@', '');
  const url = `${API_BASE}/channels?part=contentDetails,snippet&forHandle=${cleanHandle}&key=${API_KEY}`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (data.error) throw new Error(`API Error: ${data.error.message}`);
  if (!data.items?.length) throw new Error('频道未找到，请检查 handle');
  return {
    id: data.items[0].id,
    title: data.items[0].snippet.title,
    uploadsPlaylistId: data.items[0].contentDetails.relatedPlaylists.uploads,
  };
}

/**
 * 获取上传播放列表中的所有视频 ID
 */
async function getPlaylistItems(playlistId) {
  let items = [];
  let pageToken = null;
  do {
    const url = `${API_BASE}/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=50&key=${API_KEY}${pageToken ? '&pageToken=' + pageToken : ''}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.error) throw new Error(`API Error: ${data.error.message}`);
    items.push(...(data.items || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return items;
}

/**
 * 批量获取视频详情
 */
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
    const data = await resp.json();
    if (data.error) throw new Error(`API Error: ${data.error.message}`);
    allVideos.push(...(data.items || []));
  }
  return allVideos;
}

/**
 * 主函数
 */
async function main() {
  console.log('🔍 获取频道信息...');
  const channel = await getChannelId(YOUTUBE_HANDLE);
  console.log(`  频道: ${channel.title} (${channel.id})`);

  console.log('📋 获取视频列表...');
  const playlistItems = await getPlaylistItems(channel.uploadsPlaylistId);
  console.log(`  共 ${playlistItems.length} 个视频`);

  // 提取视频 ID
  const videoIds = playlistItems.map(item => item.contentDetails.videoId);

  console.log('📊 获取视频详情...');
  const videoDetails = await getVideoDetails(videoIds);
  console.log(`  获取了 ${videoDetails.length} 个视频的详情`);

  // 处理和分类
  console.log('🏷️ 分类中...');
  const videos = videoDetails.map(video => {
    const { snippet, contentDetails, liveStreamingDetails } = video;
    const description = snippet.description || '';
    const category = detectCategory(video);
    const collab = detectCollaboration(description);
    const series = detectSeries(snippet.title, description);

    return {
      id: video.id,
      title: snippet.title,
      thumbnail: (snippet.thumbnails?.maxres || snippet.thumbnails?.high || snippet.thumbnails?.medium || snippet.thumbnails?.default)?.url || '',
      publishedAt: snippet.publishedAt,
      durationDisplay: formatDuration(contentDetails.duration),
      category: category,
      series: series,
      url: `https://www.youtube.com/watch?v=${video.id}`,
      isShort: parseDuration(contentDetails.duration).totalSeconds <= 60,
      isCollaboration: collab.isCollab,
      collaborators: collab.collaborators,
    };
  });

  // 更新联动标记：如果检测到联动但分类不是联动，则同时标记
  // （联动视频也可能是录播或视频分类，但description有@mention即算联动）
  for (const v of videos) {
    if (v.isCollaboration) {
      v.category = '联动';
    }
  }

  // 按发布时间降序排列
  videos.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  const output = {
    lastUpdated: new Date().toISOString(),
    channelId: channel.id,
    channelTitle: channel.title,
    videos: videos,
  };

  // 确保 data 目录存在
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  const outputPath = join(DATA_DIR, 'videos.json');
  writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

  // 统计
  const counts = {};
  videos.forEach(v => {
    counts[v.category] = (counts[v.category] || 0) + 1;
  });

  console.log(`\n✅ 完成！共 ${videos.length} 个视频写入 data/videos.json`);
  console.log('  分类统计:', counts);
}

main().catch(err => {
  console.error('❌ 错误:', err.message);
  process.exit(1);
});
