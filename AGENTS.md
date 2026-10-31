# Codex 小桌宠

## 读取顺序

- 先读全局 C:/Users/pc/.codex/AGENTS.md
- 再读本文件
- 再读 memory/MEMORY.md，按任务挑一到两个记忆文件

## 目标

做一个透明置顶的 Electron 小桌宠。把网页链接拖到嘴部，读取页面并吐出摘要。视频网站尽量抓字幕，拿不到字幕就明确说明摘要基于标题和简介。

## 运行

- npm install
- npm start
- npm test
- npm run screenshot
- 需要 AI 摘要时，把 .env.example 复制成 .env 并填 Key
- 不填 Key 也能用，默认走本地抽取式摘要

## 目录

- electron/main.cjs 透明窗口、置顶、IPC、截图模式
- electron/preload.cjs 暴露摘要、打开链接、关闭窗口
- src/extract.cjs 网页抓取、正文和元数据提取、YouTube 字幕
- src/env.cjs 读取本地 .env
- src/local-summary.cjs 本地抽取式摘要
- src/ai-summary.cjs 可选的大模型摘要
- src/summarize.cjs 抓取、字幕、摘要的总流程
- renderer/index.html 桌宠、气泡、输入框、结果卡片
- renderer/styles.css 皮肤、透明窗口、动画和布局
- renderer/app.js 拖拽、换肤、结果渲染
- tests/summarize.test.cjs 摘要核心测试
- docs/pet.png 初始界面截图
- docs/pet-result.png 摘要结果截图
- docs/pet-live.png 真窗口拖拽验收截图

## 硬约束

- 拖拽入口必须在嘴部，输入框只是备用入口
- 摘要只根据抓到的正文写，不补写页面没有的信息
- 视频没有字幕时，结果里必须写清来源限制
- AI 调用失败必须回退本地摘要，不能卡住界面
- 换肤只改外观，不影响摘要和拖拽逻辑
- 不配置 AI 时，链接只在本地进程里抓取
- 配置 AI 后，正文和链接会发给所配置的模型服务
- 不下载视频文件，不绕过登录、付费墙和地区限制
- B 站字幕需要登录时，只使用本机 BILIBILI_COOKIE 请求字幕接口
- 改摘要流程、拖拽或界面，同步更新 README.md、tests 和 memory/project_pet.md
- memory/ 只保留在本地，不提交到公开仓库

## 记忆

- 入口是 memory/MEMORY.md
- 改功能、界面或摘要流程，先读 memory/project_pet.md
