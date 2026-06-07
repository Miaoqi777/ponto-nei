# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

先斗寧（Ponto Nei）NIJISANJI 虚拟主播的角色介绍网页。纯静态 HTML/CSS/JS，部署于 GitHub Pages。

- 在线地址：`https://miaoqi777.github.io/ponto-nei/`
- 设计参考：NIJISANJI WORLD TOUR 2025 官方页面（白底简约日系风格）
- 角色形象色：`#5A7DFF`（蓝紫），用于页面点缀

## 文件架构

```
├── index.html                  # 角色介绍主页
├── collection.html             # 商品图鉴管理页（表单 + 卡片网格）
├── videos.html                 # YouTube 视频档案页（分类 + 系列分组）
├── tweets.html                 # Twitter/X 推文整理页（分类过滤）
├── css/style.css               # 全局样式（白底日系，CSS 变量驱动）
├── js/main.js                  # 主页：加载动画、导航、粒子、滚动入场动画
├── js/collection.js            # 图鉴页：localStorage CRUD、图片 Base64、搜索排序
├── js/videos.js                # 视频档案：JSON加载、分类过滤、系列分组、卡片渲染
├── js/tweets.js                # 推文整理：JSON加载、分类过滤、卡片渲染
├── data/videos.json            # 视频静态数据（YouTube API → JSON）
├── data/tweets.json            # 推文静态数据（Twitter syndication → JSON）
├── scripts/fetch-videos.mjs    # Node.js：YouTube Data API v3 → videos.json
├── scripts/fetch-tweets.mjs    # Node.js：Twitter syndication → tweets.json
├── .github/workflows/          # GitHub Actions 每日自动刷新
│   └── refresh-data.yml
└── .gitignore
```

## 关键设计约定

### CSS 变量系统（`css/style.css :root`）
所有颜色通过 CSS 变量控制，改色只需修改变量值：
- `--bg` / `--bg-secondary`：背景色系
- `--text` / `--text-secondary` / `--text-muted`：文字色系
- `--primary` / `--accent`：蓝紫点缀色
- `--gradient-primary`：蓝紫渐变（品牌名、头像环等）
- `--card-bg` / `--card-border`：卡片样式

### 动画系统
- **加载动画**：`.loading` + `loadingGrad` 关键帧（CSS only）
- **滚动入场**：`.reveal` + `.revealed`，由 `main.js` 中 IntersectionObserver 触发
- 图鉴页**不要**给表单加 `.reveal` 类（该页未加载 `main.js`）

### 图鉴数据模型（localStorage）
```js
// Key: 'ponto-nei-collection'
[{ id, name, price, quantity, image, link, note, createdAt }]
```
- 图片以 Base64 存入，限制单张 ≤ 2MB
- `saveCollection()` 内置 QuotaExceededError 处理

## 常用命令

```bash
# 本地预览：直接用浏览器打开 index.html


```

## 已配置的 remote
- `origin`：Gitee（`miao7qi7/ponto_nei`，需实名认证）
- `github`：GitHub（`Miaoqi777/ponto-nei`，实际部署用）

## HTML 页面结构

### index.html
`navbar` → `.hero`（粒子 + 装饰带 + 头像 + 社交按钮 + 滚动提示）→ `.arch-divider` → `#profile`（简介卡片 + 档案表）→ `.arch-divider` → `#goods`（6 张商品链接卡片）→ `.arch-divider` → `footer`

### collection.html
`navbar` → `.form-section`（图片上传 + 表单字段 + btn-arrow 提交）→ `.collection-controls`（搜索 + 排序 + 计数）→ `.collection-grid`（JS 动态渲染卡片）→ `footer`

### videos.html
`navbar` → `.archive-page` → `.section` → `.filter-bar`（分类标签 + 计数）→ `.archive-meta`（更新时间 + 视频计数）→ `.video-grid`（按系列分组的视频卡片，含缩略图、时长、分类角标）→ `footer`

### tweets.html
`navbar` → `.archive-page` → `.section` → `.filter-bar`（分类标签 + 计数）→ `.archive-meta`（更新时间 + 推文计数）→ `.tweet-grid`（推文卡片：头像 + 用户名 + 正文 + 媒体 + 互动数据）→ `footer`

## 数据更新

```bash
# 拉取最新 YouTube 视频数据（需要 YOUTUBE_API_KEY 环境变量）
node scripts/fetch-videos.mjs

# 拉取最新 Twitter 推文数据（无需 API key）
node scripts/fetch-tweets.mjs
```

GitHub Actions 每日 UTC 3:27 自动刷新 data/*.json 并提交。

## 按钮体系
- `.btn-arrow`：主按钮（黑→紫渐变 + 竖线 + 箭头，参考 NIJISANJI 官方样式）
- `.btn-arrow.--light`：白色变体
- `.btn-outline`：线框按钮
- `.btn-sm`：卡片内小按钮（购买/编辑/删除）
