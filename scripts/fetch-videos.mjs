/**
 * YouTube 视频数据获取脚本
 * 使用 YouTube Data API v3
 * 环境变量: YOUTUBE_API_KEY
 * 输出: data/videos.json
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

var __dirname = dirname(fileURLToPath(import.meta.url));
var ROOT = join(__dirname, '..');
var DATA_DIR = join(ROOT, 'data');

var YOUTUBE_HANDLE = '@PontoNei';
var API_KEY = process.env.YOUTUBE_API_KEY || 'AIzaSyBo7YsK1YBoaRFRM-6t_zsMU9xxTFN2jSU';
var API_BASE = 'https://www.googleapis.com/youtube/v3';

// 系列匹配（顺序重要，先匹配先生效）
var SERIES_PATTERNS = [
  { r: /Minecraft|マイクラ|マインクラフト/i, s: 'Minecraft' },
  { r: /スプラトゥーン|Splatoon|スプラ/i, s: 'Splatoon' },
  { r: /ポケモン|Pok[eé]mon/i, s: 'Pokemon' },
  { r: /マリオカート|マリカ|Mario[ .-]?Kart/i, s: 'Mario Kart' },
  { r: /(【|#)マリオ|Super[ .-]?Mario/i, s: 'Mario' },
  { r: /モンハン|モンスターハンター|Monster[ .-]?Hunter/i, s: 'Monster Hunter' },
  { r: /ファイアーエムブレム|FEエンゲージ|エムブレム|Fire[ .-]?Emblem/i, s: 'Fire Emblem' },
  { r: /R\.E\.P\.O|REPO/i, s: 'R.E.P.O.' },
  { r: /ドラゴンクエスト|ドラクエ|Dragon[ .-]?Quest/i, s: 'Dragon Quest' },
  { r: /ゼルダ|Zelda|知恵のかりもの/i, s: '塞尔达传说' },
  { r: /トモダチコレクション|Tomodachi/i, s: 'Tomodachi Collection' },
  { r: /あつ森|どうぶつの森|Animal[ .-]?Crossing/i, s: 'Animal Crossing' },
  { r: /(【|#)ARK[^a-z]|アーク[^a-z]/i, s: 'ARK' },
  { r: /原神|Genshin|げんしん/i, s: '原神' },
  { r: /崩壊|スターレイル|スタレ|崩坏/i, s: '崩坏系列' },
  { r: /APEX|エーペックス/i, s: 'APEX' },
  { r: /VALORANT|ヴァロラント|バロラント/i, s: 'VALORANT' },
  { r: /桃鉄|桃太郎電鉄/i, s: '桃鉄' },
  { r: /スト6|ストリートファイター|Street[ .-]?Fighter/i, s: 'Street Fighter' },
  { r: /スマブラ|大乱闘|Smash[ .-]?Bros/i, s: '大乱斗Smash Bros' },
  { r: /Among[ .-]?Us|アモングアス/i, s: 'Among Us' },
  { r: /第五人格|Identity[ .-]?V|アイデンティティ/i, s: 'Identity V' },
  { r: /Phasmophobia|ファズモフォビア/i, s: 'Phasmophobia' },
  { r: /Ib|Ib[:：]|イヴ.*ホラー/i, s: 'Ib' },
  { r: /8番出口|8番のりば|8ばんめ/i, s: '8番出口' },
  { r: /(【|#)ホラー|怖い話|恐怖ゲーム|ホラーゲーム/i, s: '恐怖游戏' },
  { r: /踊ってみた|#踊ってみた|ダンス/i, s: '踊ってみた' },
  { r: /歌枠|カラオケ|弾き語り/i, s: '歌枠' },
  { r: /歌ってみた|#歌ってみた|#Cover\b|covered[ .]+by|カバー|#cover/i, s: '歌ってみた' },
  { r: /同時視聴|ウォッチパーティ|Watch[ .-]?Party/i, s: '同时视听' },
  { r: /雑談|フリートーク|近況報告|おしゃべり|#雑談/i, s: '雑談' },
  { r: /麻雀|マージャン/i, s: '麻雀' },
  { r: /TRPG|クトゥルフ|CoC[^a-z]/i, s: 'TRPG' },
  { r: /新衣装|お披露目|3Dお披露目/i, s: '特别企画' },
  { r: /誕生日|記念配信|Anniversary|周年|デビュー.*周年/i, s: '纪念配信' },
  { r: /にじフェス|にじヌーン|にじさんじ甲子園|にじGTA|にじ歌謡祭|にじエアライダー/i, s: 'NIJISANJI大型企画' },
  { r: /#shorts|#Short\b/i, s: 'Shorts' },
];

// 联动检测: 排除非VTuber的@mention
var COLLAB_BLACKLIST = [
  'nijisanji', 'nijisanji_app', 'nijisanji_official', 'nijisanji_world',
  'anycolor_inc', 'anycolor_info',
  'youtube', 'youtubemusic', 'twitter', 'x',
  'nishikikope', '322_ovo',
  'YOASOBI_Official', 'Ayase', 'XG', 'ChroNoiR',
];

function isBlacklisted(h) {
  h = h.toLowerCase();
  for (var i = 0; i < COLLAB_BLACKLIST.length; i++) {
    if (h === COLLAB_BLACKLIST[i].toLowerCase()) return true;
  }
  // 过滤所有 ponto_nei 变体
  if (h.indexOf('ponto_nei') !== -1 || h.indexOf('pontonei') !== -1) return true;
  return false;
}

var COLLAB_KEYWORDS = ['コラボ', '連合', 'コラボ配信', ' × ', ' vs ', ' with ', 'コラボ企画', '凸待ち', '凸', '緊急招集'];

function parseDuration(iso) {
  var m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return { hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 };
  return {
    hours: parseInt(m[1] || '0'),
    minutes: parseInt(m[2] || '0'),
    seconds: parseInt(m[3] || '0'),
    totalSeconds: (parseInt(m[1] || '0') * 3600) + (parseInt(m[2] || '0') * 60) + parseInt(m[3] || '0')
  };
}

function formatDuration(iso) {
  var d = parseDuration(iso);
  if (d.hours > 0) return d.hours + ':' + String(d.minutes).padStart(2, '0') + ':' + String(d.seconds).padStart(2, '0');
  return d.minutes + ':' + String(d.seconds).padStart(2, '0');
}

function detectBaseCategory(video, durationSec) {
  if (durationSec <= 60) return '短视频';
  if (video.liveStreamingDetails && video.liveStreamingDetails.actualEndTime) return '录播';
  if (durationSec >= 1800) return '录播';
  return '视频';
}

function detectCollaboration(description, title) {
  if (!description && !title) return { isCollab: false, collaborators: [] };
  var desc = description || '';
  var t = title || '';

  var mentions = desc.match(/@[\w][\w.-]{2,49}/g) || [];
  var seen = {};
  var filtered = [];
  for (var i = 0; i < mentions.length; i++) {
    var h = mentions[i].replace('@', '');
    if (!isBlacklisted(h) && !seen[h]) {
      seen[h] = true;
      filtered.push(h);
    }
  }

  var hasKeyword = false;
  for (var j = 0; j < COLLAB_KEYWORDS.length; j++) {
    if (t.indexOf(COLLAB_KEYWORDS[j]) !== -1 || desc.indexOf(COLLAB_KEYWORDS[j]) !== -1) {
      hasKeyword = true;
      break;
    }
  }

  // 联动判定: 过滤后有>=2个mention 或 (>=1个mention 且有联动关键词)
  var isCollab = filtered.length >= 2 || (filtered.length >= 1 && hasKeyword);

  return { isCollab: isCollab, collaborators: isCollab ? filtered : [] };
}

// 翻唱检测: 匹配歌ってみた/Cover模式的投稿视频（非直播）
var COVER_PATTERNS = [/歌ってみた/i, /#歌ってみた/i, /#Cover\b/i, /covered[ .]+by/i, /カバー/i, /#cover\b/i];

function detectCoverSong(title, description, durationSec, hasLiveStream) {
  if (durationSec <= 30) return false; // 太短不是翻唱
  if (durationSec > 1800 && hasLiveStream) return false; // 长直播不是翻唱（歌枠）
  var text = (title + ' ' + (description || ''));
  for (var i = 0; i < COVER_PATTERNS.length; i++) {
    if (COVER_PATTERNS[i].test(text)) return true;
  }
  return false;
}

function detectSeries(title, description) {
  var text = (title + ' ' + (description || ''));
  for (var i = 0; i < SERIES_PATTERNS.length; i++) {
    if (SERIES_PATTERNS[i].r.test(text)) return SERIES_PATTERNS[i].s;
  }
  return null;
}

async function getChannelId(handle) {
  var clean = handle.replace('@', '');
  var url = API_BASE + '/channels?part=contentDetails,snippet&forHandle=' + clean + '&key=' + API_KEY;
  var resp = await fetch(url);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  var data = await resp.json();
  if (data.error) throw new Error('API Error: ' + data.error.message);
  if (!data.items || !data.items.length) throw new Error('Channel not found');
  return {
    id: data.items[0].id,
    title: data.items[0].snippet.title,
    uploadsPlaylistId: data.items[0].contentDetails.relatedPlaylists.uploads,
  };
}

async function getPlaylistItems(playlistId) {
  var items = [], pageToken = null, pages = 0;
  do {
    pages++;
    var url = API_BASE + '/playlistItems?part=snippet,contentDetails&playlistId=' + playlistId + '&maxResults=50&key=' + API_KEY + (pageToken ? '&pageToken=' + pageToken : '');
    var resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var data = await resp.json();
    if (data.error) throw new Error('API Error: ' + data.error.message);
    if (data.items) items = items.concat(data.items);
    pageToken = data.nextPageToken;
    console.log('  第' + pages + '页: ' + (data.items ? data.items.length : 0) + '个 (累计' + items.length + ')');
  } while (pageToken);
  return items;
}

async function getVideoDetails(videoIds) {
  var all = [];
  for (var i = 0; i < videoIds.length; i += 50) {
    var batch = videoIds.slice(i, i + 50);
    var url = API_BASE + '/videos?part=snippet,contentDetails,statistics,liveStreamingDetails&id=' + batch.join(',') + '&maxResults=50&key=' + API_KEY;
    var resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var data = await resp.json();
    if (data.error) throw new Error('API Error: ' + data.error.message);
    if (data.items) all = all.concat(data.items);
  }
  return all;
}

async function main() {
  console.log('Getting channel info...');
  var channel = await getChannelId(YOUTUBE_HANDLE);
  console.log('  ' + channel.title + ' (' + channel.id + ')');

  console.log('Getting video list...');
  var items = await getPlaylistItems(channel.uploadsPlaylistId);
  console.log('  Total: ' + items.length + ' videos');

  var ids = items.map(function(x) { return x.contentDetails.videoId; });

  console.log('Getting details (' + Math.ceil(ids.length / 50) + ' batches)...');
  var details = await getVideoDetails(ids);
  console.log('  Got ' + details.length + ' video details');

  console.log('Classifying...');
  var videos = details.map(function(v) {
    var title = v.snippet.title || '';
    var desc = v.snippet.description || '';
    var durSec = parseDuration(v.contentDetails.duration).totalSeconds;
    var baseCat = detectBaseCategory(v, durSec);
    var collab = detectCollaboration(desc, title);
    var series = detectSeries(title, desc);
    var cat = collab.isCollab ? '联动'
      : detectCoverSong(title, desc, durSec, !!(v.liveStreamingDetails && v.liveStreamingDetails.actualEndTime)) ? '翻唱'
      : baseCat;
    var thumb = '';
    var t = v.snippet.thumbnails;
    if (t) thumb = ((t.maxres || t.high || t.medium || t.default || {}).url || '').replace('i.ytimg.com','img.youtube.com');

    return {
      id: v.id,
      title: title,
      thumbnail: thumb,
      publishedAt: v.snippet.publishedAt,
      durationDisplay: formatDuration(v.contentDetails.duration),
      category: cat,
      series: series,
      url: 'https://www.youtube.com/watch?v=' + v.id,
      isShort: durSec <= 60,
      isCollaboration: collab.isCollab,
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

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(join(DATA_DIR, 'videos.json'), JSON.stringify(output, null, 2), 'utf-8');

  var catCounts = {}, serCounts = {}, collabCount = 0;
  videos.forEach(function(v) {
    catCounts[v.category] = (catCounts[v.category] || 0) + 1;
    serCounts[v.series || '(未分组)'] = (serCounts[v.series || '(未分组)'] || 0) + 1;
    if (v.isCollaboration) collabCount++;
  });

  console.log('\nDone! ' + videos.length + ' videos saved.');
  console.log('Categories: ' + JSON.stringify(catCounts));
  console.log('Collabs detected: ' + collabCount);
  console.log('Series count: ' + Object.keys(serCounts).length);
  console.log('Ungrouped: ' + (serCounts['(未分组)'] || 0));
}

main().catch(function(err) {
  console.error('FATAL: ' + err.message);
  process.exit(1);
});
