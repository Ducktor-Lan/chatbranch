(function initChatBranch() {
  const STORAGE_KEY = {
    settings: "chatbranch:settings",
    pendingQuickAsk: "chatbranch:pendingQuickAsk"
  };

  const DEFAULT_SETTINGS = {
    overlayTtlMs: 8000,
    debugMode: false,
    quickAskTarget: "same-site",
    commonCommands: ["总结上文关键结论", "提取可执行行动清单", "用更简洁的表达重写", "翻译成英文"]
  };

  const QUICK_ASK_TARGETS = {
    "same-site": null,
    chatgpt: "https://chatgpt.com/",
    gemini: "https://gemini.google.com/app",
    m365: "https://m365.cloud.microsoft/chat/?auth=1",
    deepseek: "https://chat.deepseek.com/",
    doubao: "https://www.doubao.com/chat/"
  };

  const state = {
    adapter: null,
    conversationId: "",
    panelVisible: true,
    activeAnchorId: null,
    observer: null,
    scrollListenerAttached: false,
    quickAskOverlay: null,
    settings: { ...DEFAULT_SETTINGS },
    panel: null,
    searchInput: null,
    listRoot: null,
    statusRoot: null,
    metaRoot: null,
    promptModal: null,
    promptListRoot: null,
    promptInput: null,
    wakeButton: null,
    isCollapsed: false,
    messageByEl: new WeakMap(),
    orderedMessages: [],
    scheduled: false,
    lastStructureHash: "",
    scrollContainer: window
  };

  function log(...args) {
    if (state.settings.debugMode) {
      console.log("[ChatBranch]", ...args);
    }
  }

  async function bootstrap() {
    if (!window.ChatBranchAdapters) {
      return;
    }
    state.adapter = window.ChatBranchAdapters.getActiveAdapter(window.location);
    if (!state.adapter) {
      return;
    }

    state.conversationId = state.adapter.detectConversationId?.() || window.location.pathname || "default";
    state.scrollContainer = state.adapter.getScrollContainer?.() || window;

    await loadSettings();
    await consumePendingQuickAsk();
    mountPanel();
    fullRebuild();
    bindMutationObserver();
    bindScrollSpy();
    bindRuntimeMessages();
    bindLatexClickCopy();
    log("booted", state.adapter.siteKey, state.conversationId);
  }

  async function loadSettings() {
    const stored = await chrome.storage.local.get(STORAGE_KEY.settings);
    const settings = stored[STORAGE_KEY.settings] || {};
    state.settings = { ...DEFAULT_SETTINGS, ...settings };
  }

  function bindRuntimeMessages() {
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || typeof message.type !== "string") {
        return;
      }
      if (message.type === "CHATBRANCH_TOGGLE_PANEL") {
        togglePanelVisibility();
      }
      if (message.type === "CHATBRANCH_FOCUS_SEARCH") {
        state.searchInput?.focus();
      }
      if (message.type === "CHATBRANCH_OPEN_QUICKASK_DIALOG") {
        openQuickAskDialog(message.selectionText || String(window.getSelection() || "").trim());
      }
    });
  }

  function openQuickAskDialog(selectionText) {
    const seed = (selectionText || "").trim();
    const userQuestion = window.prompt("ChatBranch Quick Ask\n请输入你的问题", "");
    if (!userQuestion || !userQuestion.trim()) {
      return;
    }

    const composedPrompt = composeQuickAskPrompt(seed, userQuestion.trim());
    const target = resolveQuickAskTarget();
    const finalUrl = buildQuickAskUrl(target);

    savePendingQuickAsk(target, composedPrompt);
    chrome.runtime.sendMessage({ type: "CHATBRANCH_OPEN_TAB", url: finalUrl }, () => {
      tryCopyText(composedPrompt);
      showOverlay("ChatBranch: new tab opened, prompt prepared and copied.", false);
    });
  }

  function composeQuickAskPrompt(selectionText, userQuestion) {
    const context = buildFullContext();
    const selected = String(selectionText || "").trim();
    const selectionBlock = selected ? `\n[用户选中引用]\n${selected}\n` : "";
    const branchTitle = `分支.${extractConversationTitle()}`;
    return [
      `[分支标题]\n${branchTitle}`,
      "请基于以下上下文回答问题。",
      context ? `\n[最近对话上下文]\n${context}\n` : "",
      selectionBlock,
      "[我的问题]",
      userQuestion
    ]
      .filter(Boolean)
      .join("\n");
  }

  function buildFullContext() {
    if (!state.orderedMessages.length) {
      return "";
    }
    return state.orderedMessages
      .map((m) => {
        const roleName = m.role === "user" ? "用户" : m.role === "assistant" ? "助手" : "消息";
        return `${roleName}: ${String(m.text || "").trim()}`;
      })
      .join("\n");
  }

  async function savePendingQuickAsk(target, prompt) {
    const branchTitle = `分支.${extractConversationTitle()}`;
    const payload = {
      target,
      prompt,
      branchTitle,
      createdAt: Date.now(),
      sourceSite: state.adapter?.siteKey || "unknown"
    };
    await chrome.storage.local.set({ [STORAGE_KEY.pendingQuickAsk]: payload });
  }

  async function consumePendingQuickAsk() {
    try {
      const data = await chrome.storage.local.get(STORAGE_KEY.pendingQuickAsk);
      const payload = data[STORAGE_KEY.pendingQuickAsk];
      if (!payload || !shouldApplyPendingQuickAsk(payload)) {
        return;
      }
      const ok = await injectPromptToComposer(payload.prompt);
      if (ok) {
        showOverlay(`ChatBranch: prompt inserted. 标题建议：${payload.branchTitle}`, false);
      } else {
        tryCopyText(payload.prompt);
        showOverlay(`ChatBranch: could not auto-fill. Prompt copied. 标题建议：${payload.branchTitle}`, true);
      }
      await chrome.storage.local.remove(STORAGE_KEY.pendingQuickAsk);
    } catch (_) {
      log("consume pending quick ask failed");
    }
  }

  function shouldApplyPendingQuickAsk(payload) {
    const age = Date.now() - Number(payload.createdAt || 0);
    if (!payload.prompt || age > 180000) {
      return false;
    }
    const currentSite = state.adapter?.siteKey;
    if (!currentSite) {
      return false;
    }
    if (payload.target === "same-site") {
      return true;
    }
    return payload.target === currentSite;
  }

  async function injectPromptToComposer(prompt) {
    for (let i = 0; i < 18; i += 1) {
      const input = findComposerElement();
      if (input && setComposerText(input, prompt)) {
        return true;
      }
      await waitMs(350);
    }
    return false;
  }

  function findComposerElement() {
    const selectors = [
      "textarea",
      "div[contenteditable='true']",
      "rich-textarea textarea",
      "[role='textbox']",
      "[class*='composer'] textarea",
      "[class*='input'] textarea"
    ];
    for (const selector of selectors) {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }
        if (isInsideChatBranchUI(node)) {
          continue;
        }
        if (isVisible(node)) {
          return node;
        }
      }
    }
    return null;
  }

  function isInsideChatBranchUI(node) {
    return Boolean(node.closest("#chatbranch-panel") || node.closest(".chatbranch-modal"));
  }

  function setComposerText(node, prompt) {
    if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement) {
      node.focus();
      node.value = prompt;
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
      queueMicrotask(() => {
        node.selectionStart = node.value.length;
        node.selectionEnd = node.value.length;
      });
      return true;
    }
    if (node.isContentEditable) {
      node.focus();
      node.textContent = prompt;
      node.dispatchEvent(new InputEvent("input", { bubbles: true, data: prompt, inputType: "insertText" }));
      return true;
    }
    if ((node.getAttribute("role") || "") === "textbox") {
      node.focus();
      node.textContent = prompt;
      node.dispatchEvent(new Event("beforeinput", { bubbles: true }));
      node.dispatchEvent(new InputEvent("input", { bubbles: true, data: prompt, inputType: "insertText" }));
      return true;
    }
    return false;
  }

  function appendComposerText(node, additionText) {
    const extra = String(additionText || "").trim();
    if (!extra) {
      return false;
    }
    if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement) {
      node.focus();
      node.value = node.value ? `${node.value}\n${extra}` : extra;
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    if (node.isContentEditable) {
      node.focus();
      node.textContent = node.textContent ? `${node.textContent}\n${extra}` : extra;
      node.dispatchEvent(new InputEvent("input", { bubbles: true, data: extra, inputType: "insertText" }));
      return true;
    }
    if ((node.getAttribute("role") || "") === "textbox") {
      node.focus();
      node.textContent = node.textContent ? `${node.textContent}\n${extra}` : extra;
      node.dispatchEvent(new Event("beforeinput", { bubbles: true }));
      node.dispatchEvent(new InputEvent("input", { bubbles: true, data: extra, inputType: "insertText" }));
      return true;
    }
    return false;
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }
    const style = window.getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  }

  function waitMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function mountPanel() {
    if (document.getElementById("chatbranch-panel")) {
      return;
    }

    const panel = document.createElement("aside");
    panel.id = "chatbranch-panel";
    panel.className = "chatbranch-panel";

    panel.innerHTML =
      '<div class="chatbranch-head">' +
      '<div class="chatbranch-title">ChatBranch</div>' +
      '<button id="chatbranch-collapse" class="chatbranch-btn chatbranch-tool-btn" type="button">Fold</button>' +
      "</div>" +
      '<input id="chatbranch-search" class="chatbranch-search" type="text" placeholder="Search user prompts" />' +
      '<div id="chatbranch-status" class="chatbranch-status">Parsing...</div>' +
      '<div id="chatbranch-meta" class="chatbranch-meta"></div>' +
      '<div id="chatbranch-tools" class="chatbranch-tools"></div>' +
      '<div id="chatbranch-commands" class="chatbranch-commands"></div>' +
      '<ol id="chatbranch-list" class="chatbranch-list"></ol>';

    document.body.appendChild(panel);

    state.panel = panel;
    state.searchInput = panel.querySelector("#chatbranch-search");
    state.listRoot = panel.querySelector("#chatbranch-list");
    state.statusRoot = panel.querySelector("#chatbranch-status");
    state.metaRoot = panel.querySelector("#chatbranch-meta");

    const tools = panel.querySelector("#chatbranch-tools");
    panel.querySelector("#chatbranch-collapse")?.addEventListener("click", () => collapsePanel());
    if (tools) {
      const promptBtn = document.createElement("button");
      promptBtn.className = "chatbranch-btn chatbranch-tool-btn";
      promptBtn.type = "button";
      promptBtn.textContent = "Prompt Library";
      promptBtn.addEventListener("click", () => openPromptLibrary());
      tools.appendChild(promptBtn);

      const mdBtn = document.createElement("button");
      mdBtn.className = "chatbranch-btn chatbranch-tool-btn";
      mdBtn.type = "button";
      mdBtn.textContent = "Export Selected MD";
      mdBtn.addEventListener("click", () => exportActiveQuestionMarkdown());
      tools.appendChild(mdBtn);
    }

    state.searchInput?.addEventListener("input", () => renderOutline());

    const wakeButton = document.createElement("button");
    wakeButton.id = "chatbranch-wake";
    wakeButton.className = "chatbranch-wake-btn";
    wakeButton.type = "button";
    wakeButton.textContent = "ChatBranch";
    wakeButton.style.display = "none";
    wakeButton.addEventListener("click", () => expandPanel());
    document.body.appendChild(wakeButton);
    state.wakeButton = wakeButton;
  }

  function collapsePanel() {
    state.isCollapsed = true;
    if (state.panel) {
      state.panel.classList.add("chatbranch-hidden");
    }
    if (state.wakeButton) {
      state.wakeButton.style.display = "inline-flex";
    }
  }

  function expandPanel() {
    state.isCollapsed = false;
    state.panelVisible = true;
    if (state.panel) {
      state.panel.classList.remove("chatbranch-hidden");
    }
    if (state.wakeButton) {
      state.wakeButton.style.display = "none";
    }
  }

  function togglePanelVisibility() {
    if (state.isCollapsed) {
      expandPanel();
      return;
    }
    state.panelVisible = !state.panelVisible;
    state.panel?.classList.toggle("chatbranch-hidden", !state.panelVisible);
    if (state.wakeButton) {
      state.wakeButton.style.display = state.panelVisible ? "none" : "inline-flex";
    }
  }

  function openPromptLibrary() {
    if (!state.promptModal) {
      const modal = document.createElement("div");
      modal.className = "chatbranch-modal";
      modal.innerHTML =
        '<div class="chatbranch-modal-card">' +
        '<div class="chatbranch-modal-title">Prompt Library</div>' +
        '<div id="chatbranch-prompt-list" class="chatbranch-prompt-list"></div>' +
        '<textarea id="chatbranch-prompt-input" class="chatbranch-prompt-input" placeholder="输入新提示词"></textarea>' +
        '<div class="chatbranch-modal-actions">' +
        '<button id="chatbranch-prompt-add" class="chatbranch-btn" type="button">Add</button>' +
        '<button id="chatbranch-prompt-close" class="chatbranch-btn" type="button">Close</button>' +
        "</div></div>";
      document.body.appendChild(modal);
      state.promptModal = modal;
      state.promptListRoot = modal.querySelector("#chatbranch-prompt-list");
      state.promptInput = modal.querySelector("#chatbranch-prompt-input");
      modal.querySelector("#chatbranch-prompt-add")?.addEventListener("click", () => addPromptItem());
      modal.querySelector("#chatbranch-prompt-close")?.addEventListener("click", () => closePromptLibrary());
    }
    renderPromptItems();
    state.promptModal.style.display = "flex";
  }

  function closePromptLibrary() {
    if (state.promptModal) {
      state.promptModal.style.display = "none";
    }
  }

  function addPromptItem() {
    const value = String(state.promptInput?.value || "").trim();
    if (!value) {
      return;
    }
    const list = Array.isArray(state.settings.commonCommands) ? [...state.settings.commonCommands] : [];
    list.push(value);
    state.settings.commonCommands = list;
    state.promptInput.value = "";
    saveSettings();
    renderPromptItems();
  }

  function renderPromptItems() {
    if (!state.promptListRoot) {
      return;
    }
    state.promptListRoot.innerHTML = "";
    const list = Array.isArray(state.settings.commonCommands) ? state.settings.commonCommands : [];
    for (let i = 0; i < list.length; i += 1) {
      const cmd = list[i];
      const row = document.createElement("div");
      row.className = "chatbranch-prompt-row";
      const useBtn = document.createElement("button");
      useBtn.className = "chatbranch-cmd-chip";
      useBtn.type = "button";
      useBtn.textContent = cmd;
      useBtn.addEventListener("click", () => {
        closePromptLibrary();
        const composer = findComposerElement();
        if (!composer || !appendComposerText(composer, cmd)) {
          tryCopyText(cmd);
          showOverlay("ChatBranch: input box not found. Prompt copied to clipboard.", true);
          return;
        }
        showOverlay("ChatBranch: prompt inserted.", false);
      });
      const delBtn = document.createElement("button");
      delBtn.className = "chatbranch-btn chatbranch-tool-btn";
      delBtn.type = "button";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", () => {
        const next = [...list];
        next.splice(i, 1);
        state.settings.commonCommands = next;
        saveSettings();
        renderPromptItems();
      });
      row.appendChild(useBtn);
      row.appendChild(delBtn);
      state.promptListRoot.appendChild(row);
    }
  }

  function saveSettings() {
    chrome.storage.local.set({ [STORAGE_KEY.settings]: state.settings }).catch(() => {});
  }

  function bindLatexClickCopy() {
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const latex = extractLatexFromElement(target);
        if (!latex) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const normalized = normalizeLatex(latex);
        if (!normalized) {
          return;
        }
        tryCopyText(normalized);
        showOverlay("ChatBranch: LaTeX copied.", false);
      },
      true
    );
  }

  function extractLatexFromElement(target) {
    const container =
      target.closest("mjx-container") ||
      target.closest(".katex") ||
      target.closest("annotation") ||
      target.closest(".math") ||
      null;
    if (!container) {
      return "";
    }
    const ann = container.querySelector("annotation");
    const annText = (ann?.textContent || "").trim();
    if (annText) {
      return annText;
    }
    const text = (container.textContent || "").trim();
    return /\\|\^|_|\{|\}/.test(text) ? text : "";
  }

  function normalizeLatex(text) {
    const raw = String(text || "").trim();
    const stripped = raw.replace(/^\$+|\$+$/g, "").trim();
    return stripped ? `$${stripped}$` : "";
  }

  function exportActiveQuestionMarkdown() {
    if (!state.orderedMessages.length) {
      showOverlay("ChatBranch: no conversation messages found.", true);
      return;
    }

    const questionItems = getOutlineItems();
    if (!questionItems.length) {
      showOverlay("ChatBranch: no user questions found.", true);
      return;
    }

    const labels = questionItems.map((q) => `${q.order}. ${q.title}`);
    const pick = window.prompt(`输入要导出的题号 (1-${labels.length})\n${labels.slice(0, 20).join("\n")}`, "1");
    const index = Number(pick);
    if (!Number.isFinite(index) || index < 1 || index > labels.length) {
      showOverlay("ChatBranch: export canceled.", true);
      return;
    }

    const selected = questionItems[index - 1];
    const block = collectMessageBlockByAnchor(selected.domAnchorId);
    if (!block.length) {
      showOverlay("ChatBranch: cannot resolve selected block.", true);
      return;
    }

    const title = extractConversationTitle();
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const lines = [`# ${title}`, "", `- Exported by ChatBranch`, `- Time: ${new Date().toLocaleString()}`, ""];
    lines.push(`## Selected Question`);
    lines.push(selected.text);
    lines.push("");
    lines.push("## Outputs");
    lines.push("");
    for (const m of block) {
      const role = m.role === "user" ? "User" : m.role === "assistant" ? "Assistant" : "Message";
      lines.push(`## ${role}`);
      lines.push(String(m.text || ""));
      lines.push("");
    }

    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title || "chat"}-${ts}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showOverlay("ChatBranch: markdown exported.", false);
  }

  function collectMessageBlockByAnchor(anchorId) {
    const idx = state.orderedMessages.findIndex((m) => m.domAnchorId === anchorId);
    if (idx < 0) {
      return [];
    }
    const out = [];
    for (let i = idx; i < state.orderedMessages.length; i += 1) {
      const m = state.orderedMessages[i];
      if (i > idx && m.role === "user") {
        break;
      }
      out.push(m);
    }
    return out;
  }

  function tryCopyText(text) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  }

  function triggerQuickAskWithSelection() {
    const selection = String(window.getSelection() || "").trim();
    openQuickAskDialog(selection);
  }

  function resolveQuickAskTarget() {
    if (state.settings.quickAskTarget === "same-site") {
      return state.adapter.siteKey;
    }
    return state.settings.quickAskTarget;
  }

  function buildQuickAskUrl(target) {
    if (target === "chatgpt") {
      return "https://chatgpt.com/";
    }
    if (target === "gemini") {
      return "https://gemini.google.com/app";
    }
    if (target === "m365") {
      return "https://m365.cloud.microsoft/chat/?auth=1";
    }
    if (target === "deepseek") {
      return "https://chat.deepseek.com/";
    }
    if (target === "doubao") {
      return "https://www.doubao.com/chat/";
    }
    return QUICK_ASK_TARGETS[target] || "https://chatgpt.com/";
  }

  function fullRebuild() {
    state.messageByEl = new WeakMap();
    state.orderedMessages = [];
    state.lastStructureHash = "";
    incrementalCollect();
    renderOutline(true);
  }

  function incrementalCollect() {
    const conversationId = state.adapter.detectConversationId?.() || window.location.pathname || "default";
    if (conversationId !== state.conversationId) {
      state.conversationId = conversationId;
      fullRebuild();
      return;
    }

    const rawElements = state.adapter.getMessageElements();
    for (let i = 0; i < rawElements.length; i += 1) {
      const el = rawElements[i];
      const role = state.adapter.getRole(el);
      if (role === "unknown") {
        continue;
      }
      const text = state.adapter.getText(el);
      if (!text) {
        continue;
      }
      const anchorId = state.adapter.ensureAnchor(el);
      const existing = state.messageByEl.get(el);
      const signature = `${role}|${text.length}|${text.slice(0, 120)}`;

      if (!existing) {
        state.messageByEl.set(el, {
          id: `${state.adapter.siteKey}:${state.conversationId}:${anchorId}`,
          role,
          text,
          domAnchorId: anchorId,
          index: i,
          signature
        });
      } else if (existing.signature !== signature || existing.index !== i) {
        existing.role = role;
        existing.text = text;
        existing.index = i;
        existing.signature = signature;
      }
    }

    const next = [];
    for (const el of rawElements) {
      const m = state.messageByEl.get(el);
      if (m) {
        next.push(m);
      }
    }
    state.orderedMessages = next;
  }

  function getOutlineItems() {
    const list = [];
    for (const m of state.orderedMessages) {
      if (m.role === "user" && isUsablePromptText(m.text)) {
        list.push({ ...m, order: list.length + 1, title: makeTitle(m.text) });
      }
    }
    return list;
  }

  function isUsablePromptText(text) {
    const value = String(text || "").trim();
    if (value.length < 2) {
      return false;
    }
    if (/^[:：\-\s]+$/.test(value)) {
      return false;
    }
    if (/^\S+[:：]\s*$/.test(value)) {
      return false;
    }
    if (/^https?:\/\//i.test(value) && value.length < 140) {
      return false;
    }
    const noLinks = value.replace(/https?:\/\/\S+/g, "").trim();
    if (noLinks.length < 2) {
      return false;
    }
    const alphaNum = value.replace(/[^\p{L}\p{N}\u4e00-\u9fff]/gu, "");
    return alphaNum.length >= 2;
  }

  function renderOutline(force) {
    if (!state.listRoot || !state.statusRoot) {
      return;
    }
    const outline = getOutlineItems();
    const query = (state.searchInput?.value || "").trim().toLowerCase();
    const items = !query
      ? outline
      : outline.filter((item) => item.title.toLowerCase().includes(query) || item.text.toLowerCase().includes(query));

    const structureHash = items.map((x) => `${x.domAnchorId}:${x.order}:${x.title}`).join("|");
    if (!force && structureHash === state.lastStructureHash) {
      updateStatus(outline.length, items.length);
      applyActiveItem();
      return;
    }
    state.lastStructureHash = structureHash;
    state.listRoot.innerHTML = "";

    if (!items.length) {
      state.statusRoot.textContent = "No user messages found.";
      renderMeta(0, state.orderedMessages.length);
      return;
    }

    for (const item of items) {
      const li = document.createElement("li");
      li.className = "chatbranch-item";
      li.setAttribute("data-anchor", item.domAnchorId);
      li.innerHTML = '<span class="chatbranch-item-index">' + item.order + '</span><span class="chatbranch-item-title"></span>';
      li.querySelector(".chatbranch-item-title").textContent = item.title;
      li.addEventListener("click", () => jumpToAnchor(item.domAnchorId));
      state.listRoot.appendChild(li);
    }

    updateStatus(outline.length, items.length);
    renderMeta(outline.length, state.orderedMessages.length);
    applyActiveItem();
  }

  function updateStatus(totalUser, shown) {
    if (!totalUser) {
      state.statusRoot.textContent = "No user messages found.";
      return;
    }
    state.statusRoot.textContent = shown === totalUser ? `${totalUser} user messages indexed` : `${shown}/${totalUser} messages shown`;
  }

  function renderMeta(userCount, totalCount) {
    if (state.metaRoot) {
      state.metaRoot.textContent = `site: ${state.adapter?.siteKey || "unknown"} | user: ${userCount} | total: ${totalCount}`;
    }
  }

  function jumpToAnchor(anchorId) {
    const target = document.getElementById(anchorId) || document.querySelector(`[data-chatbranch-anchor-id='${anchorId}']`);
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("chatbranch-target-highlight");
    setTimeout(() => target.classList.remove("chatbranch-target-highlight"), 1400);
    state.activeAnchorId = anchorId;
    applyActiveItem();
  }

  function bindMutationObserver() {
    if (!document.body) {
      return;
    }
    state.observer = new MutationObserver(() => scheduleIncrementalUpdate());
    state.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function scheduleIncrementalUpdate() {
    if (state.scheduled) {
      return;
    }
    state.scheduled = true;
    requestAnimationFrame(() => {
      state.scheduled = false;
      incrementalCollect();
      renderOutline();
    });
  }

  function bindScrollSpy() {
    if (state.scrollListenerAttached) {
      return;
    }
    const onScroll = throttle(() => {
      const nearest = getNearestUserAnchor();
      if (nearest) {
        state.activeAnchorId = nearest;
        applyActiveItem();
      }
    }, 120);

    if (state.scrollContainer === window) {
      window.addEventListener("scroll", onScroll, { passive: true });
    } else {
      state.scrollContainer.addEventListener("scroll", onScroll, { passive: true });
    }
    state.scrollListenerAttached = true;
  }

  function getNearestUserAnchor() {
    const outline = getOutlineItems();
    if (!outline.length) {
      return null;
    }
    const midpoint = window.innerHeight * 0.35;
    let minDist = Number.POSITIVE_INFINITY;
    let selected = null;
    for (const item of outline) {
      const el = document.getElementById(item.domAnchorId) || document.querySelector(`[data-chatbranch-anchor-id='${item.domAnchorId}']`);
      if (!el) {
        continue;
      }
      const dist = Math.abs(el.getBoundingClientRect().top - midpoint);
      if (dist < minDist) {
        minDist = dist;
        selected = item.domAnchorId;
      }
    }
    return selected;
  }

  function applyActiveItem() {
    if (!state.listRoot) {
      return;
    }
    const items = state.listRoot.querySelectorAll(".chatbranch-item");
    for (const item of items) {
      item.classList.toggle("chatbranch-item-active", item.getAttribute("data-anchor") === state.activeAnchorId);
    }
  }

  function makeTitle(text) {
    const firstLine = text.split(/\n/).map((s) => s.trim()).find(Boolean) || text.trim();
    return firstLine.length <= 56 ? firstLine : `${firstLine.slice(0, 56)}...`;
  }

  function extractConversationTitle() {
    const titleNode =
      document.querySelector("h1") ||
      document.querySelector("header h2") ||
      document.querySelector("[class*='conversation-title']") ||
      document.querySelector("[class*='chat-title']");
    const title = (titleNode?.textContent || document.title || "").trim();
    const clean = title.replace(/[\\/:*?"<>|]+/g, "-").trim();
    return clean || "未命名对话";
  }

  function showOverlay(text, isError) {
    if (!state.quickAskOverlay) {
      const overlay = document.createElement("div");
      overlay.className = "chatbranch-overlay";
      document.body.appendChild(overlay);
      state.quickAskOverlay = overlay;
    }
    state.quickAskOverlay.textContent = text;
    state.quickAskOverlay.classList.toggle("chatbranch-overlay-error", Boolean(isError));
    state.quickAskOverlay.classList.add("chatbranch-overlay-visible");
    const ttl = clampTtl(state.settings.overlayTtlMs);
    clearTimeout(state.quickAskOverlay._hideTimer);
    state.quickAskOverlay._hideTimer = setTimeout(() => {
      state.quickAskOverlay?.classList.remove("chatbranch-overlay-visible");
    }, ttl);
  }

  function clampTtl(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return DEFAULT_SETTINGS.overlayTtlMs;
    }
    return Math.min(30000, Math.max(1000, Math.floor(n)));
  }

  function throttle(fn, wait) {
    let lastCall = 0;
    let timeout = null;
    return function throttled(...args) {
      const now = Date.now();
      const remaining = wait - (now - lastCall);
      if (remaining <= 0) {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        lastCall = now;
        fn.apply(this, args);
      } else if (!timeout) {
        timeout = setTimeout(() => {
          lastCall = Date.now();
          timeout = null;
          fn.apply(this, args);
        }, remaining);
      }
    };
  }

  bootstrap().catch((error) => {
    console.error("ChatBranch bootstrap failed", error);
  });
})();
