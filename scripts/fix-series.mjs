/**
 * 一次性脚本：修复 videos.json 中误分类的系列
 * 根据视频标题重新匹配系列，修正 ~155 条被错误归入「纪念配信」的数据
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_PATH = join(ROOT, 'data', 'videos.json');

// 系列匹配（与 fetch-videos.mjs 保持同步）
const SERIES_PATTERNS = [
  { r: /Minecraft|マイクラ|マインクラフト/i, s: 'Minecraft' },
  { r: /スプラトゥーン|Splatoon|スプラ|にじイカ祭/i, s: 'Splatoon' },
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
  { r: /(【|#)ARK[^a-z]|にじARK|アーク[^a-z]/i, s: 'ARK' },
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
  { r: /雑談|フリートーク|近況報告|おしゃべり|#雑談|朝雑談|スパチャ読み/i, s: '雑談' },
  { r: /(【|#)ホラー|Poppy[ .-]Playtime|Content[ .-]Warning|Escape[ .-]The[ .-]Backrooms|意味がわかると怖い|肝試し|ホラゲ/i, s: '恐怖游戏' },
  { r: /踊ってみた|#踊ってみた|ダンス/i, s: '踊ってみた' },
  { r: /歌枠|カラオケ|弾き語り/i, s: '歌枠' },
  { r: /歌ってみた|#歌ってみた|#Cover\b|covered[ .]+by|カバー|#cover/i, s: '歌ってみた' },
  { r: /同時視聴|ウォッチパーティ|Watch[ .-]?Party/i, s: '同时视听' },
  { r: /麻雀|マージャン|雀魂|じゃんたま/i, s: '麻雀' },
  { r: /TRPG|クトゥルフ|CoC[^a-z]/i, s: 'TRPG' },
  { r: /新衣装|お披露目|3Dお披露目/i, s: '特别企画' },
  { r: /ペルソナ|Persona|P3R|P4G|P5[RXS]/i, s: 'Persona' },
  { r: /龍が如く|如龍|Yakuza|龍が如く/i, s: '如龙' },
  { r: /Undertale|アンダーテール/i, s: 'Undertale' },
  { r: /ファイナルファンタジー|Final[ .-]Fantasy|FF[XVI]{1,3}[^a-z]/i, s: 'FINAL FANTASY' },
  { r: /ゼノブレイド|Xenoblade/i, s: 'Xenoblade' },
  { r: /ホグワーツ|Hogwarts[ .-]Legacy/i, s: 'Hogwarts Legacy' },
  { r: /Coffee[ .-]Talk/i, s: 'Coffee Talk' },
  { r: /Supermarket[ .-]Simulator/i, s: 'Supermarket Simulator' },
  { r: /ドラゴンボール|Dragon[ .-]Ball|KAKAROT/i, s: 'Dragon Ball' },
  { r: /逆転裁判|Ace[ .-]Attorney/i, s: '逆転裁判' },
  { r: /デレステ|アイドルマスター|iDOLM@STER/i, s: '偶像大师' },
  { r: /プロセカ|Project[ .-]Sekai/i, s: 'Project Sekai' },
  { r: /都市伝説解体/i, s: '都市伝説解体センター' },
  { r: /カービィ|Kirby/i, s: '星のカービィ' },
  { r: /Ghostwire[ :.\-]+Tokyo/i, s: 'Ghostwire: Tokyo' },
  { r: /エルシャダイ|El[ .-]Shaddai/i, s: 'El Shaddai' },
  { r: /RUST[^a-z]|#にじらす/i, s: 'RUST' },
  { r: /激辛ランチ/i, s: '激辛ランチ' },
  { r: /空の軌跡|Trails[ .-]in[ .-]the[ .-]Sky/i, s: '空の軌跡' },
  { r: /ダンガンロンパ|Danganronpa/i, s: '弹丸论破' },
  { r: /テイルズオブアライズ|Tales[ .-]of[ .-]Arise/i, s: 'Tales of Arise' },
  { r: /BLEACH[ .-]Rebirth/i, s: 'BLEACH' },
  { r: /JUDGE[ .-]EYES|ジャッジアイズ/i, s: 'JUDGE EYES' },
  { r: /ピクミン|Pikmin/i, s: 'Pikmin' },
  { r: /スーパーマリオRPG|Super[ .-]Mario[ .-]RPG/i, s: 'Mario RPG' },
  { r: /ときメモ|Tokimeki/i, s: '心跳回忆GS' },
  { r: /スイカゲーム/i, s: 'Suika Game' },
  { r: /Detroit[ :.\-]+Become[ :.\-]+Human/i, s: 'Detroit: Become Human' },
  { r: /PEAK[^a-z]/i, s: 'PEAK' },
  { r: /パタポン|Patapon/i, s: 'Patapon' },
  { r: /TNTスマッシュ/i, s: 'TNT Smash' },
  { r: /共通テスト/i, s: '共通テスト' },
  { r: /メグとばけもの/i, s: 'メグとばけもの' },
  { r: /GeoGuessr/i, s: 'GeoGuessr' },
  { r: /ロードモバイル|Lords[ .-]Mobile/i, s: 'Lords Mobile' },
  { r: /PowerWash[ .-]Simulator/i, s: 'PowerWash Simulator' },
  { r: /RAFT[^a-z]/i, s: 'RAFT' },
  { r: /ゲーム発展国/i, s: 'Game Dev Story' },
  { r: /対談|ボーダーライン/i, s: '对谈' },
  { r: /Papers,[ .]Please|DEEEER|Vampire[ .-]Survivors|Heave[ .-]Ho|Untitled[ .-]Goose|LoveChoice|Only[ .-]Up|Stanley[ .-]Parable|Amanda/i, s: '独立游戏' },
  { r: /誕生日|生誕祭|誕生祭|お誕生日|半年記念|記念日|Anniversary|周年|デビュー.*周年/i, s: '纪念配信' },
  { r: /にじフェス|にじヌーン|にじさんじ甲子園|にじGTA|にじ歌謡祭|にじエアライダー/i, s: 'NIJISANJI大型企画' },
  { r: /#shorts|#Short\b/i, s: 'Shorts' },
];

function detectSeries(title) {
  for (let i = 0; i < SERIES_PATTERNS.length; i++) {
    if (SERIES_PATTERNS[i].r.test(title)) return SERIES_PATTERNS[i].s;
  }
  return null;
}

// ── 主流程 ──────────────────────────────────────────
console.log('🔧 读取 videos.json...');
const data = JSON.parse(readFileSync(DATA_PATH, 'utf-8'));

const videoList = data.videos || data;
if (!Array.isArray(videoList)) {
  console.error('❌ 无法识别 videos.json 格式, typeof videoList:', typeof videoList);
  process.exit(1);
}

console.log(`  共 ${videoList.length} 条视频\n`);

const changes = [];
let fixedCount = 0;

for (const v of videoList) {
  const oldSeries = v.series;
  const newSeries = detectSeries(v.title);

  if (oldSeries !== newSeries) {
    changes.push({
      title: v.title.substring(0, 60),
      old: oldSeries,
      new: newSeries,
    });
    v.series = newSeries;
    fixedCount++;
  }
}

// 统计新系列分布
const newCounts = {};
for (const v of videoList) {
  const s = v.series || '(无)';
  newCounts[s] = (newCounts[s] || 0) + 1;
}

console.log('📊 变更明细（前50条）：');
changes.slice(0, 50).forEach(c => {
  console.log(`  ${c.old || '(无)'} → ${c.new || '(无)'}  |  ${c.title}`);
});
if (changes.length > 50) console.log(`  ... 共 ${changes.length} 条变更`);

console.log(`\n✅ 共修正 ${fixedCount} 条视频的系列\n`);

console.log('📊 修正后系列分布：');
Object.entries(newCounts)
  .sort((a, b) => b[1] - a[1])
  .forEach(([s, n]) => console.log(`  ${s}: ${n}`));

// 写回
writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
console.log(`\n💾 已写入 ${DATA_PATH}`);
