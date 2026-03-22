# ChatBranch

中文优先文档。English version: [Jump to English](#english)

ChatBranch 是一个面向 Chrome/Edge（MV3）的 AI 对话导航与分支提问扩展。

<p align="center">
  <img src="images/logo.png" alt="ChatBranch Logo" width="180" />
</p>

---

## 中文

### 解决的问题

- 长对话回溯困难，定位历史提问效率低。
- 需要从某段内容发起“分支提问”，又不想污染主线。
- 常用提示词需要快速复用并直接写入当前输入框。
- 遇到公式时需要快速复制标准 LaTeX。

### 当前支持范围

- 已支持站点：
  - `chatgpt.com`（兼容 `chat.openai.com`）
  - `gemini.google.com`
  - `m365.cloud.microsoft/chat/?auth=1`（M365 Copilot）
  - `chat.deepseek.com`
  - `www.doubao.com`

### 主要功能

1. **提问索引导航（Outline）**
   - 自动识别当前页面已渲染的用户消息
   - 生成可搜索索引
   - 点击索引平滑跳转并高亮
   - 随滚动自动高亮当前条目
   - DOM 增量变化自动更新

2. **分支提问（新标签页工作流）**
   - 从选中文本触发（右键/快捷键）
   - 构建分支提示词，包含：
     - 分支标题：`分支.<原始对话标题>`
     - 当前会话全量历史（已渲染部分）
     - 用户选中引用
     - 用户新问题
   - 新开目标 AI 标签页
   - 尝试自动填入输入框；失败则自动复制到剪贴板

3. **Prompt Library（提示词库）**
   - 一个按钮打开提示词库弹窗
   - 支持新增、查看、删除、复用
   - 点击某条提示词可直接插入当前页面输入框

4. **LaTeX 点击复制**
   - 在 AI 输出中点击公式区域（MathJax/KaTeX）即可复制标准化 `$...$`

5. **按问题导出 Markdown**
   - 可选择某个问题编号，仅导出该问题及其对应输出块（到下一条用户问题前）

### 目录结构

```text
ChatBranch/
  extension/
    manifest.json
    service_worker.js
    content/
      content_script.js
      styles.css
      adapters/
        registry.js
        utils.js
        chatgpt.js
        gemini.js
    options/
      options.html
      options.js
```

### 安装方式（开发者模式）

1. 打开 `chrome://extensions` 或 `edge://extensions`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择 `extension/`

### 使用方式

1. 打开 ChatGPT / Gemini 对话页
2. 使用右侧索引面板搜索并跳转历史提问
3. 分支提问：
   - 选中文本
   - 右键 `ChatBranch: Ask In New Tab`
   - 输入新问题
4. 点击 `Prompt Library` 复用常用提示词到当前输入框
5. 点击公式区域复制 LaTeX
6. 点击 `Export Selected MD` 导出指定问题的 Markdown

### 快捷键

- 当前版本已移除默认快捷键，主要通过右键菜单和面板按钮操作

### 注意事项

- “全历史”指当前 DOM 已渲染的全部消息
- 若站点启用懒加载，请先上滑加载更多历史再发起分支提问

---

## English

### What It Solves

- Long conversations are hard to navigate
- Users need to branch from a selected segment without polluting the main thread
- Reusable prompt templates should be inserted quickly into the active composer
- Mathematical output often needs one-click LaTeX copy

### Current Scope

- Supported sites:
  - `chatgpt.com` (`chat.openai.com` compatible)
  - `gemini.google.com`
  - `m365.cloud.microsoft/chat/?auth=1` (M365 Copilot)
  - `chat.deepseek.com`
  - `www.doubao.com`

### Core Features

1. **Outline / Index Navigation**
   - Detects user messages from currently rendered conversation
   - Builds a searchable outline panel
   - Click-to-jump with smooth scroll and target highlight
   - Scroll-spy style active item highlight
   - MutationObserver incremental updates

2. **Branch Ask (New Tab Workflow)**
   - Trigger from selected text (context menu / shortcut)
   - Builds a branch prompt with:
     - Branch title: `分支.<original conversation title>`
     - Full conversation history (currently rendered)
     - Selected quote block
     - Your new question
   - Opens target AI site in a new tab
   - Attempts auto-fill into composer; falls back to clipboard copy

3. **Prompt Library**
   - One button opens prompt library modal
   - Add, view, delete, and reuse saved prompt templates
   - Selecting a prompt inserts it directly into current page composer

4. **LaTeX Click-to-Copy**
   - Click formula area in AI output (`MathJax` / `KaTeX`) to copy normalized `$...$` LaTeX

5. **Export Selected Markdown**
   - Export one selected question block (selected user question + following outputs until next user question)

### Project Structure

```text
ChatBranch/
  extension/
    manifest.json
    service_worker.js
    content/
      content_script.js
      styles.css
      adapters/
        registry.js
        utils.js
        chatgpt.js
        gemini.js
    options/
      options.html
      options.js
```

### Installation (Developer Mode)

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable Developer Mode
3. Click **Load unpacked**
4. Select `extension/`

### Usage

1. Open a ChatGPT or Gemini conversation page
2. Use the right panel to search and jump among user messages
3. For branching:
   - Select text in conversation
   - Right click `ChatBranch: Ask In New Tab`
   - Enter your question
4. Use `Prompt Library` in panel to insert common templates into composer
5. Click formula output to copy LaTeX
6. Use `Export Selected MD` to export one selected question block

### Shortcuts

- No default shortcuts in current version; use context menu and panel controls

### Notes

- “Full history” means all messages currently rendered in DOM
- If a site lazy-loads old messages, scroll up first to load more history
