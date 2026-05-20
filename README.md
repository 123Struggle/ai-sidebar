# AI Sidebar

一个类似 Sider 的 Chrome 侧边栏 AI 助手插件，支持对话问答、网页摘要、图片识别、翻译等功能。可接入任意 OpenAI 兼容 API。

## 功能

- **AI 对话** — 流式输出，实时显示回复
- **图片粘贴** — 支持多张图片粘贴，识别图中文字
- **网页摘要** — 一键总结当前页面内容，中文输出
- **翻译** — 中英互译，支持图片文字识别翻译
- **Markdown 渲染** — 代码块、标题、列表、加粗等格式化显示
- **一键复制** — 鼠标悬停 AI 回复即可复制
- **深色模式** — 支持浅色 / 深色 / 跟随系统
- **对话历史** — 自动保存，支持多轮对话切换
- **自定义 System Prompt** — 自定义助手人设和行为

## 安装

1. 下载或克隆本项目到本地
2. 打开 Chrome，访问 `chrome://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择 `ai-sidebar` 文件夹

## 配置

首次使用需配置 API：

1. 点击扩展图标打开侧边栏
2. 点击右上角齿轮图标进入设置
3. 填写：
   - **Endpoint URL** — API 地址，如 `https://api.openai.com/v1`
   - **API Key** — 你的 API 密钥
   - **模型 ID** — 如 `gpt-4o`、`deepseek-chat`、`mimo-v2.5`
4. 可选：填写 System Prompt 自定义助手行为
5. 点击保存

支持所有 OpenAI 兼容接口（自动补全 `/v1/chat/completions`）。

## 使用

| 操作 | 说明 |
|------|------|
| 输入文字 + Enter | 发送消息 |
| Shift + Enter | 换行 |
| 粘贴图片 | 支持 Ctrl+V 粘贴截图 |
| 点击「摘要」 | 总结当前网页内容 |
| 点击「翻译」 | 翻译输入框中的文字或图片 |
| 悬停 AI 回复 | 显示复制按钮 |
| 点击 + | 新建对话 |
| 点击时钟 | 查看历史对话 |

## 文件结构

```
ai-sidebar/
├── manifest.json              # 扩展配置
├── icons/                     # 扩展图标
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── sidepanel/
│   ├── sidepanel.html         # 侧边栏页面
│   ├── sidepanel.css          # 样式
│   └── sidepanel.js           # UI 逻辑
├── background/
│   └── service-worker.js      # API 调用 + 消息路由
└── content/
    └── content-script.js      # 网页内容提取
```

## 技术栈

- Chrome Extension Manifest V3
- Chrome Side Panel API
- 原生 HTML / CSS / JavaScript（无依赖）
- SSE 流式传输
- CSS 自定义属性主题系统

## License

MIT
