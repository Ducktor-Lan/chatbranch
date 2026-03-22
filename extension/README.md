# ChatBranch (MV3)

ChatBranch is a Chrome/Edge Manifest V3 extension focused on:

- M1: Multi-site injection + Outline navigation
- M2: AskLine Quick Ask with Gemini provider

## Supported sites (current adapters)

- chatgpt.com (+ chat.openai.com)
- gemini.google.com

## Implemented now

- Site adapter registry and 2 adapters (ChatGPT/Gemini)
- Outline panel with user-message indexing
- Incremental collector cache (better performance on long chats)
- Search filter, click-to-jump, scroll spy active highlight
- MutationObserver incremental refresh
- Context menu + keyboard command pipeline for Quick Ask
- Quick Ask opens a new tab on ChatGPT/Gemini and prepares prompt with context
- Options page for overlay TTL, debug mode, quick-ask target site

## Load extension

1. Open `chrome://extensions` or `edge://extensions`
2. Enable developer mode
3. Click "Load unpacked"
4. Select `extension/`

## Commands

- `Alt+I`: toggle panel
- `Alt+S`: focus search
- `Alt+Shift+Q`: quick ask selected text

## Quick Ask behavior

- Right click selected text -> `ChatBranch: Ask In New Tab`
- ChatBranch asks for your question in a prompt dialog
- A new tab is opened at target AI site set in options
- Prompt includes recent conversation context + selected text + your question
- ChatBranch attempts to auto-fill prompt into the new page composer
- If auto-fill fails, prompt is copied to clipboard as fallback

## Extra Tools

- Prompt Library: one button to add/view/reuse prompts, selected prompt inserts into composer
- Click-to-Copy LaTeX: clicking formula area copies normalized `$...$`
- Export Selected Markdown: export one selected question block (question + outputs)

## Reliability Notes

- For diagnostics, enable `debug mode` in options and inspect page console logs.
- Gemini does not support URL-based auto-filled prompt reliably; ChatBranch opens Gemini tab and keeps prompt in the dialog flow.
