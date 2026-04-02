(function initChatBranch() {
  const STORAGE_KEY = {
    settings: "chatbranch:settings",
    pendingQuickAsk: "chatbranch:pendingQuickAsk",
    customNames: "chatbranch:customNames"
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
    deepseek: "https://chat.deepseek.com/"
  };

  const state = {
    adapter: null,
    conversationId: "",
    panelVisible: true,
    activeAnchorId: null,
    observer: null,
    scrollSpyContainer: null,
    scrollSpyHandler: null,
    quickAskOverlay: null,
    quickAskModal: null,
    quickAskSelection: null,
    quickAskQuestionInput: null,
    quickAskPreview: null,
    currentQuickAskSelection: "",
    settings: { ...DEFAULT_SETTINGS },
    panel: null,
    searchInput: null,
    listRoot: null,
    statusRoot: null,
    metaRoot: null,
    promptModal: null,
    promptListRoot: null,
    promptInput: null,
    promptContentInput: null,
    promptSearchInput: null,
    promptCategoryFilter: null,
    promptCategoryInput: null,
    promptFileInput: null,
    wakeButton: null,
    isCollapsed: false,
    messageByEl: new WeakMap(),
    orderedMessages: [],
    scheduled: false,
    lastStructureHash: "",
    scrollContainer: window,
    customNames: {},
    nameEditModal: null,
    exportModal: null,
    exportIndexInput: null,
    exportFormatSelect: null,
    exportLabel: null
  };

  function log(...args) {
    if (state.settings.debugMode) {
      console.log("[ChatBranch]", ...args);
    }
  }

  function normalizeScrollContainer(container) {
    if (
      !container ||
      container === window ||
      container === document ||
      container === document.body ||
      container === document.documentElement ||
      container === document.scrollingElement
    ) {
      return window;
    }
    return container instanceof HTMLElement ? container : window;
  }

  function isScrollableElement(el) {
    if (!(el instanceof HTMLElement)) {
      return false;
    }
    const style = window.getComputedStyle(el);
    const overflow = `${style.overflowY || ""} ${style.overflow || ""}`.toLowerCase();
    if (!/(auto|scroll|overlay)/.test(overflow)) {
      return false;
    }
    return el.scrollHeight > el.clientHeight + 2;
  }

  function findNearestScrollableAncestor(node) {
    let current = node instanceof HTMLElement ? node.parentElement : null;
    while (current && current !== document.body && current !== document.documentElement) {
      if (isScrollableElement(current)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function isValidScrollContainer(container, target) {
    if (container === window) {
      return true;
    }
    if (!(container instanceof HTMLElement)) {
      return false;
    }
    if (target instanceof HTMLElement && !container.contains(target)) {
      return false;
    }
    return isScrollableElement(container);
  }

  function resolveScrollContainer(target) {
    const fromTarget = findNearestScrollableAncestor(target);
    if (fromTarget) {
      return fromTarget;
    }

    const fromAdapter = normalizeScrollContainer(state.adapter?.getScrollContainer?.() || window);
    if (isValidScrollContainer(fromAdapter, target)) {
      return fromAdapter;
    }

    const fromState = normalizeScrollContainer(state.scrollContainer);
    if (isValidScrollContainer(fromState, target)) {
      return fromState;
    }

    return window;
  }

  function applyScrollSpyContainer(nextContainer) {
    const normalized = normalizeScrollContainer(nextContainer);
    if (state.scrollSpyContainer === normalized) {
      state.scrollContainer = normalized;
      return normalized;
    }

    if (state.scrollSpyContainer && state.scrollSpyHandler) {
      if (state.scrollSpyContainer === window) {
        window.removeEventListener("scroll", state.scrollSpyHandler);
      } else {
        state.scrollSpyContainer.removeEventListener("scroll", state.scrollSpyHandler);
      }
    }

    state.scrollSpyContainer = normalized;
    state.scrollContainer = normalized;

    if (state.scrollSpyHandler) {
      if (normalized === window) {
        window.addEventListener("scroll", state.scrollSpyHandler, { passive: true });
      } else {
        normalized.addEventListener("scroll", state.scrollSpyHandler, { passive: true });
      }
      log("scroll spy container updated", normalized);
    }
    return normalized;
  }

  function syncScrollContainer(target) {
    const resolved = resolveScrollContainer(target);
    return applyScrollSpyContainer(resolved);
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
    state.scrollContainer = normalizeScrollContainer(state.adapter.getScrollContainer?.() || window);

    await loadSettings();
    await loadCustomNames();
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
    // Normalize commonCommands to { title, content } format
    if (Array.isArray(state.settings.commonCommands)) {
      state.settings.commonCommands = normalizeCommands(state.settings.commonCommands);
    }
  }

  async function loadCustomNames() {
    const stored = await chrome.storage.local.get(STORAGE_KEY.customNames);
    state.customNames = stored[STORAGE_KEY.customNames] || {};
  }

  function normalizeCommands(commands) {
    return commands.map(function(cmd) {
      if (typeof cmd === "string") {
        return {
          title: cmd.length > 20 ? cmd.slice(0, 20) + "..." : cmd,
          content: cmd
        };
      }
      return cmd;
    });
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
    showQuickAskPreviewModal(seed);
  }

  function showQuickAskPreviewModal(selectionText) {
    if (!state.quickAskModal) {
      const modal = document.createElement("div");
      modal.className = "chatbranch-modal";
      modal.innerHTML =
        '<div class="chatbranch-modal-card chatbranch-quickask-modal-card">' +
        '<div class="chatbranch-modal-title">Quick Ask - Branch Question</div>' +
        '<div class="chatbranch-quickask-content">' +
        '<div class="chatbranch-quickask-row">' +
        '<label>选中文本:</label>' +
        '<div id="chatbranch-quickask-selection" class="chatbranch-quickask-selection"></div>' +
        '</div>' +
        '<div class="chatbranch-quickask-row">' +
        '<label>你的问题:</label>' +
        '<input id="chatbranch-quickask-question" class="chatbranch-quickask-input" type="text" placeholder="输入你的问题..." />' +
        '</div>' +
        '<div class="chatbranch-quickask-row">' +
        '<label>生成的 Prompt:</label>' +
        '<textarea id="chatbranch-quickask-preview" class="chatbranch-quickask-preview" readonly></textarea>' +
        '</div>' +
        '</div>' +
        '<div class="chatbranch-modal-actions">' +
        '<button id="chatbranch-quickask-send" class="chatbranch-btn" type="button">Send to New Tab</button>' +
        '<button id="chatbranch-quickask-cancel" class="chatbranch-btn" type="button">Cancel</button>' +
        '</div>' +
        '</div>';
      document.body.appendChild(modal);
      state.quickAskModal = modal;
      state.quickAskSelection = modal.querySelector("#chatbranch-quickask-selection");
      state.quickAskQuestionInput = modal.querySelector("#chatbranch-quickask-question");
      state.quickAskPreview = modal.querySelector("#chatbranch-quickask-preview");

      state.quickAskQuestionInput.addEventListener("input", function() {
        updateQuickAskPreview();
      });

      modal.querySelector("#chatbranch-quickask-send").addEventListener("click", function() {
        const question = String(state.quickAskQuestionInput.value || "").trim();
        if (!question) {
          showOverlay("ChatBranch: please enter your question.", true);
          return;
        }
        const composedPrompt = state.quickAskPreview.value;
        const target = resolveQuickAskTarget();
        const finalUrl = buildQuickAskUrl(target);
        savePendingQuickAsk(target, composedPrompt);
        chrome.runtime.sendMessage({ type: "CHATBRANCH_OPEN_TAB", url: finalUrl }, function() {
          tryCopyText(composedPrompt);
          showOverlay("ChatBranch: new tab opened, prompt prepared and copied.", false);
        });
        state.quickAskModal.style.display = "none";
      });

      modal.querySelector("#chatbranch-quickask-cancel").addEventListener("click", function() {
        state.quickAskModal.style.display = "none";
      });
    }

    state.currentQuickAskSelection = selectionText;
    state.quickAskSelection.textContent = selectionText || "(无)";
    state.quickAskQuestionInput.value = "";
    updateQuickAskPreview();

    state.quickAskModal.style.display = "flex";
    state.quickAskQuestionInput.focus();
  }

  function updateQuickAskPreview() {
    const selectionText = state.currentQuickAskSelection || "";
    const question = String(state.quickAskQuestionInput?.value || "").trim();
    const preview = composeQuickAskPrompt(selectionText, question);
    if (state.quickAskPreview) {
      state.quickAskPreview.value = preview;
    }
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

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function openPromptLibrary() {
    if (!state.promptModal) {
      const modal = document.createElement("div");
      modal.className = "chatbranch-modal";
      modal.innerHTML =
        '<div class="chatbranch-modal-card chatbranch-prompt-modal-card">' +
        '<div class="chatbranch-modal-title">Prompt Library</div>' +
        '<div class="chatbranch-prompt-toolbar">' +
        '<input id="chatbranch-prompt-search" class="chatbranch-prompt-search" type="text" placeholder="搜索提示词..." />' +
        '<select id="chatbranch-prompt-category-filter" class="chatbranch-category-filter">' +
        '<option value="">全部分类</option>' +
        '<option value="通用">通用</option>' +
        '<option value="写作">写作</option>' +
        '<option value="编程">编程</option>' +
        '<option value="翻译">翻译</option>' +
        '<option value="分析">分析</option>' +
        '</select>' +
        '</div>' +
        '<div id="chatbranch-prompt-list" class="chatbranch-prompt-list"></div>' +
        '<div class="chatbranch-prompt-input-group">' +
        '<div class="chatbranch-prompt-row-inputs">' +
        '<input id="chatbranch-prompt-title" class="chatbranch-prompt-title-input" type="text" placeholder="标题（显示在按钮上）" />' +
        '<select id="chatbranch-prompt-category" class="chatbranch-category-select">' +
        '<option value="">无分类</option>' +
        '<option value="通用">通用</option>' +
        '<option value="写作">写作</option>' +
        '<option value="编程">编程</option>' +
        '<option value="翻译">翻译</option>' +
        '<option value="分析">分析</option>' +
        '</select>' +
        '</div>' +
        '<textarea id="chatbranch-prompt-input" class="chatbranch-prompt-input" placeholder="提示词内容"></textarea>' +
        '</div>' +
        '<div class="chatbranch-modal-actions">' +
        '<button id="chatbranch-prompt-import" class="chatbranch-btn chatbranch-tool-btn" type="button">Import</button>' +
        '<button id="chatbranch-prompt-export" class="chatbranch-btn chatbranch-tool-btn" type="button">Export</button>' +
        '<button id="chatbranch-prompt-add" class="chatbranch-btn" type="button">Add</button>' +
        '<button id="chatbranch-prompt-close" class="chatbranch-btn" type="button">Close</button>' +
        '</div>' +
        '<input type="file" id="chatbranch-prompt-file-input" accept=".json" style="display:none" />' +
        '</div>';
      document.body.appendChild(modal);
      state.promptModal = modal;
      state.promptListRoot = modal.querySelector("#chatbranch-prompt-list");
      state.promptInput = modal.querySelector("#chatbranch-prompt-input");
      state.promptContentInput = modal.querySelector("#chatbranch-prompt-title");
      state.promptSearchInput = modal.querySelector("#chatbranch-prompt-search");
      state.promptCategoryFilter = modal.querySelector("#chatbranch-prompt-category-filter");
      state.promptCategoryInput = modal.querySelector("#chatbranch-prompt-category");
      state.promptFileInput = modal.querySelector("#chatbranch-prompt-file-input");

      modal.querySelector("#chatbranch-prompt-add")?.addEventListener("click", () => addPromptItem());
      modal.querySelector("#chatbranch-prompt-close")?.addEventListener("click", () => closePromptLibrary());
      modal.querySelector("#chatbranch-prompt-export")?.addEventListener("click", () => exportPrompts());
      modal.querySelector("#chatbranch-prompt-import")?.addEventListener("click", () => state.promptFileInput?.click());
      state.promptFileInput?.addEventListener("change", (e) => importPrompts(e));
      state.promptSearchInput?.addEventListener("input", () => renderPromptItems());
      state.promptCategoryFilter?.addEventListener("change", () => renderPromptItems());
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
    const titleInput = state.promptContentInput;
    const contentInput = state.promptInput;
    const categoryInput = state.promptCategoryInput;
    const title = String(titleInput?.value || "").trim();
    const content = String(contentInput?.value || "").trim();
    if (!content) {
      return;
    }
    const finalTitle = title || (content.length > 20 ? content.slice(0, 20) + "..." : content);
    const category = String(categoryInput?.value || "").trim();
    const list = Array.isArray(state.settings.commonCommands) ? [...state.settings.commonCommands] : [];
    list.push({
      id: generateId(),
      title: finalTitle,
      content: content,
      category: category || undefined,
      createdAt: Date.now()
    });
    state.settings.commonCommands = list;
    titleInput.value = "";
    contentInput.value = "";
    if (categoryInput) categoryInput.value = "";
    saveSettings();
    renderPromptItems();
  }

  function renderPromptItems() {
    if (!state.promptListRoot) {
      return;
    }
    state.promptListRoot.innerHTML = "";
    let list = Array.isArray(state.settings.commonCommands) ? state.settings.commonCommands : [];

    // Normalize to object format
    list = list.map(function(item) {
      if (typeof item === "string") {
        return { id: generateId(), title: item.length > 20 ? item.slice(0, 20) + "..." : item, content: item, category: undefined };
      }
      return item.id ? item : { ...item, id: generateId() };
    });

    // Filter by search query
    const searchQuery = String(state.promptSearchInput?.value || "").trim().toLowerCase();
    if (searchQuery) {
      list = list.filter(function(item) {
        const title = (item.title || "").toLowerCase();
        const content = (item.content || "").toLowerCase();
        const category = (item.category || "").toLowerCase();
        return title.includes(searchQuery) || content.includes(searchQuery) || category.includes(searchQuery);
      });
    }

    // Filter by category
    const categoryFilter = String(state.promptCategoryFilter?.value || "").trim();
    if (categoryFilter) {
      list = list.filter(function(item) {
        return (item.category || "") === categoryFilter;
      });
    }

    // Group by category
    const groups = {};
    const noCategory = [];
    for (const item of list) {
      if (item.category) {
        if (!groups[item.category]) {
          groups[item.category] = [];
        }
        groups[item.category].push(item);
      } else {
        noCategory.push(item);
      }
    }

    // Render grouped items
    const allCategories = Object.keys(groups).sort();
    for (const cat of allCategories) {
      const header = document.createElement("div");
      header.className = "chatbranch-prompt-category-header";
      header.textContent = cat + " (" + groups[cat].length + ")";
      state.promptListRoot.appendChild(header);
      for (const item of groups[cat]) {
        renderPromptItem(item);
      }
    }

    // Render uncategorized items
    if (noCategory.length > 0) {
      const header = document.createElement("div");
      header.className = "chatbranch-prompt-category-header";
      header.textContent = "未分类 (" + noCategory.length + ")";
      state.promptListRoot.appendChild(header);
      for (const item of noCategory) {
        renderPromptItem(item);
      }
    }

    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "chatbranch-prompt-empty";
      empty.textContent = searchQuery || categoryFilter ? "没有找到匹配的提示词" : "暂无提示词，请添加";
      state.promptListRoot.appendChild(empty);
    }
  }

  function renderPromptItem(item) {
    const title = item.title || item.content;
    const content = item.content;
    const row = document.createElement("div");
    row.className = "chatbranch-prompt-row";
    const useBtn = document.createElement("button");
    useBtn.className = "chatbranch-cmd-chip";
    useBtn.type = "button";
    useBtn.textContent = title;
    useBtn.title = content;
    useBtn.addEventListener("click", function() {
      closePromptLibrary();
      const composer = findComposerElement();
      if (!composer || !appendComposerText(composer, content)) {
        tryCopyText(content);
        showOverlay("ChatBranch: input box not found. Prompt copied to clipboard.", true);
        return;
      }
      showOverlay("ChatBranch: prompt inserted.", false);
    });
    const delBtn = document.createElement("button");
    delBtn.className = "chatbranch-btn chatbranch-tool-btn";
    delBtn.type = "button";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", function() {
      const next = (state.settings.commonCommands || []).filter(function(p) {
        return p.id !== item.id;
      });
      state.settings.commonCommands = next;
      saveSettings();
      renderPromptItems();
    });
    row.appendChild(useBtn);
    row.appendChild(delBtn);
    state.promptListRoot.appendChild(row);
  }

  function exportPrompts() {
    const list = state.settings.commonCommands || [];
    const json = JSON.stringify(list, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chatbranch-prompts-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showOverlay("ChatBranch: prompts exported.", false);
  }

  function importPrompts(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const imported = JSON.parse(e.target.result);
        if (!Array.isArray(imported)) {
          showOverlay("ChatBranch: invalid format. Expected array.", true);
          return;
        }
        const existingIds = new Set((state.settings.commonCommands || []).map(function(p) { return p.id; }));
        const newList = [...(state.settings.commonCommands || [])];
        for (const item of imported) {
          const normalized = typeof item === "string"
            ? { id: generateId(), title: item.slice(0, 20), content: item }
            : { ...item, id: item.id || generateId() };
          if (!existingIds.has(normalized.id)) {
            newList.push(normalized);
          }
        }
        state.settings.commonCommands = newList;
        saveSettings();
        renderPromptItems();
        showOverlay("ChatBranch: imported " + imported.length + " prompts.", false);
      } catch (err) {
        showOverlay("ChatBranch: import failed. " + err.message, true);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
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

  const exportFormatters = {
    markdown: function(blocks, meta) {
      const lines = [`# ${meta.title}`, "", `- Exported by ChatBranch`, `- Time: ${meta.timestamp}`, ""];
      lines.push(`## Selected Question`);
      lines.push(meta.question || "");
      lines.push("");
      lines.push("## Outputs");
      lines.push("");
      for (const m of blocks) {
        const role = m.role === "user" ? "User" : m.role === "assistant" ? "Assistant" : "Message";
        lines.push(`### ${role}`);
        lines.push(String(m.text || ""));
        lines.push("");
      }
      return lines.join("\n");
    },
    html: function(blocks, meta) {
      let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(meta.title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
    h1 { border-bottom: 2px solid #0284c7; padding-bottom: 10px; }
    h3 { color: #334155; margin-top: 24px; }
    .meta { color: #64748b; font-size: 14px; }
    .message { background: #f8fafc; padding: 16px; border-radius: 8px; margin: 12px 0; white-space: pre-wrap; }
    .user { background: #e0f2fe; }
    .assistant { background: #f0fdf4; }
  </style>
</head>
<body>
  <h1>${escapeHtml(meta.title)}</h1>
  <p class="meta">Exported by ChatBranch | ${escapeHtml(meta.timestamp)}</p>
  <h2>Selected Question</h2>
  <div class="message user">${escapeHtml(meta.question || "")}</div>
  <h2>Outputs</h2>`;
      for (const m of blocks) {
        const role = m.role === "user" ? "User" : m.role === "assistant" ? "Assistant" : "Message";
        const roleClass = m.role === "user" ? "user" : m.role === "assistant" ? "assistant" : "";
        html += `\n  <h3>${escapeHtml(role)}</h3>\n  <div class="message ${roleClass}">${escapeHtml(String(m.text || ""))}</div>`;
      }
      html += "\n</body>\n</html>";
      return html;
    },
    json: function(blocks, meta) {
      return JSON.stringify({
        title: meta.title,
        exportedAt: meta.timestamp,
        exporter: "ChatBranch",
        question: meta.question,
        messages: blocks.map(function(m) {
          return { role: m.role, text: m.text };
        })
      }, null, 2);
    },
    txt: function(blocks, meta) {
      const lines = [meta.title, "=".repeat(50), "", `Exported by ChatBranch | ${meta.timestamp}`, "", "SELECTED QUESTION:", meta.question || "", ""];
      lines.push("OUTPUTS:", "");
      for (const m of blocks) {
        const role = m.role === "user" ? "USER" : m.role === "assistant" ? "ASSISTANT" : "MESSAGE";
        lines.push("[" + role + "]", String(m.text || ""), "");
      }
      return lines.join("\n");
    }
  };

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showExportDialog(questionItems) {
    if (!state.exportModal) {
      const modal = document.createElement("div");
      modal.className = "chatbranch-modal";
      modal.innerHTML =
        '<div class="chatbranch-modal-card">' +
        '<div class="chatbranch-modal-title">Export Conversation</div>' +
        '<div class="chatbranch-export-content">' +
        '<div class="chatbranch-export-row">' +
        '<label>Message Index:</label>' +
        '<input id="chatbranch-export-index" class="chatbranch-export-input" type="number" min="1" value="1" />' +
        '<span id="chatbranch-export-label" class="chatbranch-export-label"></span>' +
        '</div>' +
        '<div class="chatbranch-export-row">' +
        '<label>Format:</label>' +
        '<select id="chatbranch-export-format" class="chatbranch-export-select">' +
        '<option value="markdown">Markdown (.md)</option>' +
        '<option value="html">HTML (.html)</option>' +
        '<option value="json">JSON (.json)</option>' +
        '<option value="txt">Plain Text (.txt)</option>' +
        '</select>' +
        '</div>' +
        '</div>' +
        '<div class="chatbranch-modal-actions">' +
        '<button id="chatbranch-export-btn" class="chatbranch-btn" type="button">Export</button>' +
        '<button id="chatbranch-export-cancel" class="chatbranch-btn" type="button">Cancel</button>' +
        '</div>' +
        '</div>';
      document.body.appendChild(modal);
      state.exportModal = modal;
      state.exportIndexInput = modal.querySelector("#chatbranch-export-index");
      state.exportFormatSelect = modal.querySelector("#chatbranch-export-format");
      state.exportLabel = modal.querySelector("#chatbranch-export-label");
    }

    const maxIndex = questionItems.length;
    state.exportIndexInput.max = maxIndex;
    state.exportIndexInput.value = 1;
    updateExportLabel(questionItems, 1);

    state.exportIndexInput.oninput = function() {
      const idx = parseInt(state.exportIndexInput.value, 10);
      updateExportLabel(questionItems, idx);
    };

    state.exportModal.querySelector("#chatbranch-export-btn").onclick = function() {
      const index = parseInt(state.exportIndexInput.value, 10);
      const format = state.exportFormatSelect.value;
      if (index < 1 || index > maxIndex) {
        showOverlay("ChatBranch: invalid index.", true);
        return;
      }
      const selected = questionItems[index - 1];
      const block = collectMessageBlockByAnchor(selected.domAnchorId);
      if (!block.length) {
        showOverlay("ChatBranch: cannot resolve selected block.", true);
        return;
      }
      performExport(selected, block, format);
      state.exportModal.style.display = "none";
    };

    state.exportModal.querySelector("#chatbranch-export-cancel").onclick = function() {
      state.exportModal.style.display = "none";
    };

    state.exportModal.style.display = "flex";
    state.exportIndexInput.focus();
  }

  function updateExportLabel(questionItems, index) {
    if (index >= 1 && index <= questionItems.length) {
      state.exportLabel.textContent = questionItems[index - 1].title.slice(0, 40) + (questionItems[index - 1].title.length > 40 ? "..." : "");
    } else {
      state.exportLabel.textContent = "";
    }
  }

  function performExport(selected, block, format) {
    const title = extractConversationTitle();
    const meta = {
      title: title,
      timestamp: new Date().toLocaleString(),
      question: selected.text
    };

    const formatter = exportFormatters[format] || exportFormatters.markdown;
    const content = formatter(block, meta);

    const extensions = { markdown: "md", html: "html", json: "json", txt: "txt" };
    const mimeTypes = { markdown: "text/markdown;charset=utf-8", html: "text/html;charset=utf-8", json: "application/json;charset=utf-8", txt: "text/plain;charset=utf-8" };
    const ext = extensions[format] || "txt";
    const mimeType = mimeTypes[format] || "text/plain;charset=utf-8";

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title || "chat"}-${ts}.${ext}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function() { URL.revokeObjectURL(url); }, 2000);
    showOverlay("ChatBranch: exported as " + format.toUpperCase() + ".", false);
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

    showExportDialog(questionItems);
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
    if (target === "deepseek") {
      return "https://chat.deepseek.com/";
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
    if (rawElements.length) {
      syncScrollContainer(rawElements[rawElements.length - 1]);
    } else {
      syncScrollContainer(null);
    }

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

      // Include conversationId in the key to ensure names are scoped to current conversation
      const customNameKey = `${state.conversationId}:${item.domAnchorId}`;
      const customName = state.customNames[customNameKey];
      const displayName = customName || item.title;

      li.innerHTML =
        '<span class="chatbranch-item-index">' + item.order + '</span>' +
        '<span class="chatbranch-item-title"></span>' +
        '<button class="chatbranch-item-edit" type="button" title="编辑名称">✏️</button>';

      li.querySelector(".chatbranch-item-title").textContent = displayName;
      if (customName) {
        li.querySelector(".chatbranch-item-title").classList.add("chatbranch-item-custom");
      }

      li.addEventListener("click", (e) => {
        if (e.target.classList.contains("chatbranch-item-edit")) {
          e.stopPropagation();
          openNameEditModal(item.domAnchorId, displayName);
        } else {
          jumpToAnchor(item.domAnchorId);
        }
      });

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
      log("jumpToAnchor: target not found for", anchorId);
      return;
    }
    log("jumpToAnchor: found target", target);

    const scrollContainer = syncScrollContainer(target);
    if (scrollContainer && scrollContainer !== window && isValidScrollContainer(scrollContainer, target)) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const offsetTop = targetRect.top - containerRect.top + scrollContainer.scrollTop;
      const containerHeight = containerRect.height;
      const targetHeight = targetRect.height;

      const scrollTo = offsetTop - (containerHeight / 2) + (targetHeight / 2);
      log("jumpToAnchor: custom scroll container, scrolling to", scrollTo);
      const nextTop = Math.max(0, scrollTo);
      if (typeof scrollContainer.scrollTo === "function") {
        scrollContainer.scrollTo({
          top: nextTop,
          behavior: "smooth"
        });
      } else {
        scrollContainer.scrollTop = nextTop;
      }
    } else {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }

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
    if (state.scrollSpyHandler) {
      return;
    }
    state.scrollSpyHandler = throttle(() => {
      const nearest = getNearestUserAnchor();
      if (nearest) {
        state.activeAnchorId = nearest;
        applyActiveItem();
      }
    }, 120);
    syncScrollContainer(null);
  }

  function getNearestUserAnchor() {
    const outline = getOutlineItems();
    if (!outline.length) {
      return null;
    }
    let midpoint = window.innerHeight * 0.35;
    if (state.scrollContainer && state.scrollContainer !== window) {
      const containerRect = state.scrollContainer.getBoundingClientRect();
      midpoint = containerRect.top + containerRect.height * 0.35;
    }
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

  function openNameEditModal(anchorId, currentName) {
    if (!state.nameEditModal) {
      const modal = document.createElement("div");
      modal.className = "chatbranch-name-modal";
      modal.innerHTML =
        '<div class="chatbranch-name-modal-card">' +
        '<div class="chatbranch-name-modal-title">编辑名称</div>' +
        '<input id="chatbranch-name-input" class="chatbranch-name-input" type="text" placeholder="输入自定义名称（留空恢复默认）" />' +
        '<div class="chatbranch-name-modal-actions">' +
        '<button id="chatbranch-name-save" class="chatbranch-btn" type="button">保存</button>' +
        '<button id="chatbranch-name-cancel" class="chatbranch-btn" type="button">取消</button>' +
        "</div></div>";
      document.body.appendChild(modal);
      state.nameEditModal = modal;
    }

    const input = state.nameEditModal.querySelector("#chatbranch-name-input");
    input.value = currentName || "";

    state.nameEditModal.style.display = "flex";
    input.focus();

    const saveBtn = state.nameEditModal.querySelector("#chatbranch-name-save");
    const cancelBtn = state.nameEditModal.querySelector("#chatbranch-name-cancel");

    const handleSave = function() {
      const newName = input.value.trim();
      // Include conversationId in the key to scope names to current conversation
      const customNameKey = `${state.conversationId}:${anchorId}`;
      if (newName) {
        state.customNames[customNameKey] = newName;
      } else {
        delete state.customNames[customNameKey];
      }
      saveCustomNames();
      renderOutline(true);
      closeNameEditModal();
      showOverlay(newName ? "ChatBranch: 名称已保存" : "ChatBranch: 已恢复默认名称", false);
    };

    const handleCancel = function() {
      closeNameEditModal();
    };

    const handleKeydown = function(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSave();
      } else if (e.key === "Escape") {
        handleCancel();
      }
    };

    // Remove old listeners and add new ones
    saveBtn.onclick = handleSave;
    cancelBtn.onclick = handleCancel;
    input.onkeydown = handleKeydown;
  }

  function closeNameEditModal() {
    if (state.nameEditModal) {
      state.nameEditModal.style.display = "none";
    }
  }

  async function saveCustomNames() {
    await chrome.storage.local.set({ [STORAGE_KEY.customNames]: state.customNames });
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
