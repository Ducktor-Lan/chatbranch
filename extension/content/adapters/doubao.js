(function registerDoubao(global) {
  const siteKey = "doubao";
  const utils = global.ChatBranchAdapterUtils;

  function match(locationObj) {
    return locationObj.hostname === "www.doubao.com";
  }

  function getScrollContainer() {
    return document.querySelector("main") || document.scrollingElement || window;
  }

  function getMessageElements() {
    const root = document.querySelector("main") || document;
    const selectors = [
      "[data-testid='union_message']",
      "[data-testid='send_message']",
      "[data-testid='message_content']",
      "[data-testid='message_text_content']",
      "[data-testid='message-block-container']",
      "[data-testid='message-list']",
      "[class*='message-list']",
      "[class*='inner-item']",
      "[class*='message']",
      "div[role='listitem']"
    ];

    const raw = utils.uniqueElements(selectors, root);
    const elements = utils.pruneNestedElements(raw);
    const candidates = [];

    for (const el of elements) {
      if (isComposerNode(el) || isSidebarNode(el) || isListContainer(el)) {
        continue;
      }
      if (!utils.shouldTreatAsMessage(el) || !utils.looksLikeMessageContainer(el)) {
        continue;
      }

      const role = getRole(el);
      if (role === "unknown") {
        continue;
      }

      const text = getText(el);
      if (!text || utils.isLikelyUrlOnlyText(text)) {
        continue;
      }
      if (role === "user" && !isMeaningfulUserText(text)) {
        continue;
      }

      candidates.push({ el, role, text, testid: (el.getAttribute("data-testid") || "").toLowerCase() });
    }

    const seen = new Set();
    const output = [];
    for (const item of candidates) {
      const key = `${item.role}|${item.text.replace(/\s+/g, " ").trim()}`;
      if (seen.has(key)) {
        continue;
      }
      if (item.role === "assistant" && isThinkingOnly(item.text)) {
        continue;
      }
      seen.add(key);
      output.push(item.el);
    }
    return output;
  }

  function getRole(el) {
    const testid = (el.getAttribute("data-testid") || "").toLowerCase();
    if (testid === "send_message" || testid === "union_message") {
      return "user";
    }
    if (testid === "message_content" || testid === "message_text_content") {
      const cls = (el.className || "").toString().toLowerCase();
      if (cls.includes("justify-end")) {
        return "user";
      }
      return "assistant";
    }

    const roleAttr =
      el.getAttribute("data-message-author-role") ||
      el.getAttribute("data-role") ||
      el.getAttribute("role") ||
      "";
    if (/user|human|question|query|me/i.test(roleAttr)) {
      return "user";
    }
    if (/assistant|ai|model|answer|doubao/i.test(roleAttr)) {
      return "assistant";
    }

    const cls = (el.className || "").toString().toLowerCase();
    if (cls.includes("justify-end") || cls.includes("send-message")) {
      return "user";
    }
    if (cls.includes("thinking") || cls.includes("message-content") || cls.includes("message_text_content")) {
      return "assistant";
    }

    return utils.inferRoleCommon(el);
  }

  function getText(el) {
    const text = utils.extractBestText(el, [
      "[data-testid='message_text_content']",
      "[data-testid='message_content']",
      "[class*='message_text_content']",
      "[class*='container-']",
      "[class*='content']",
      "[class*='markdown']"
    ]);
    return cleanupDoubaoText(text);
  }

  function cleanupDoubaoText(raw) {
    const lines = String(raw || "")
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^内容由豆包\s*AI\s*生成$/.test(line))
      .filter((line) => !/^已完成思考$/.test(line))
      .filter((line) => !/^[:：\-\s]+$/.test(line));
    return utils.cleanMessageText(lines.join("\n"));
  }

  function isMeaningfulUserText(text) {
    const value = String(text || "").trim();
    if (value.length < 2) {
      return false;
    }
    if (/^[:：\-\s]+$/.test(value)) {
      return false;
    }
    return value.replace(/[^\p{L}\p{N}\u4e00-\u9fff]/gu, "").length >= 2;
  }

  function isThinkingOnly(text) {
    const value = String(text || "").trim();
    if (!value) {
      return true;
    }
    if (/^已完成思考$/.test(value)) {
      return true;
    }
    return false;
  }

  function isComposerNode(el) {
    return Boolean(el.closest("textarea") || el.closest("[role='textbox']") || el.closest("form"));
  }

  function isSidebarNode(el) {
    return Boolean(el.closest("[data-testid='chat_list_thread_item']") || el.closest("[class*='chat-item']"));
  }

  function isListContainer(el) {
    const testid = (el.getAttribute("data-testid") || "").toLowerCase();
    return testid === "message-list";
  }

  function ensureAnchor(el) {
    const existing = el.getAttribute("data-chatbranch-anchor-id");
    if (existing) {
      return existing;
    }
    const anchorId = `chatbranch-anchor-${siteKey}-${utils.stableNodeHash(el, el.innerText || "")}`;
    el.setAttribute("data-chatbranch-anchor-id", anchorId);
    if (!el.id) {
      el.id = anchorId;
    }
    return anchorId;
  }

  function detectConversationId() {
    return `${location.pathname || ""}${location.search || ""}${location.hash || ""}` || null;
  }

  global.ChatBranchAdapters.register({
    siteKey,
    match,
    getScrollContainer,
    getMessageElements,
    getRole,
    getText,
    ensureAnchor,
    detectConversationId
  });
})(window);
