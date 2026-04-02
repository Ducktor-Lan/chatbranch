(function registerDeepSeek(global) {
  const siteKey = "deepseek";
  const utils = global.ChatBranchAdapterUtils;

  function match(locationObj) {
    return locationObj.hostname === "chat.deepseek.com";
  }

  function getScrollContainer() {
    return document.querySelector("main") || document.scrollingElement || window;
  }

  function getMessageElements() {
    const root = document.querySelector("main") || document;
    const selectors = [
      ".d29f3d7d.ds-message",
      ".ds-message",
      "[class*='ds-message']",
      "div[role='listitem']",
      "article",
      "[data-testid*='message']",
      "[data-testid*='turn']"
    ];

    const raw = utils.uniqueElements(selectors, root);
    const elements = utils.pruneNestedElements(raw);
    const output = [];
    const seen = new Set();

    for (const el of elements) {
      if (!utils.shouldTreatAsMessage(el) || !utils.looksLikeMessageContainer(el)) {
        continue;
      }
      if (isComposerNode(el) || isNoiseNode(el)) {
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

      const key = `${role}|${text.replace(/\s+/g, " ").trim()}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      output.push(el);
    }

    return output;
  }

  function getRole(el) {
    const cls = String(el.className || "").toLowerCase();
    const roleAttr =
      el.getAttribute("data-message-author-role") ||
      el.getAttribute("data-role") ||
      el.getAttribute("role") ||
      "";

    if (/user|human|query|question|me/i.test(roleAttr)) {
      return "user";
    }
    if (/assistant|ai|model|answer|deepseek/i.test(roleAttr)) {
      return "assistant";
    }

    if (cls.includes("d29f3d7d") && cls.includes("ds-message")) {
      return "user";
    }
    if (cls === "ds-message _63c77b1" || (cls.includes("ds-message") && !cls.includes("d29f3d7d"))) {
      return "assistant";
    }

    const token = `${cls} ${el.getAttribute("aria-label") || ""}`.toLowerCase();
    if (token.includes("user") || token.includes("query") || token.includes("question")) {
      return "user";
    }
    if (token.includes("assistant") || token.includes("deepseek") || token.includes("answer")) {
      return "assistant";
    }

    return utils.inferRoleCommon(el);
  }

  function getText(el) {
    const textEl = el.querySelector(".ds-markdown") || el;
    const rawText = utils.extractBestText(el, [
      ".f9bf7997",
      ".ds-markdown",
      "[class*='markdown']",
      "[class*='content']",
      "[data-testid*='message-content']"
    ]);
    return cleanupDeepSeekText(utils.extractTextWithLatex(textEl, rawText));
  }

  function cleanupDeepSeekText(raw) {
    const lines = String(raw || "")
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^已思考（用时\s*\d+\s*秒）$/.test(line))
      .filter((line) => !/^thinking/i.test(line))
      .filter((line) => !/^[:：\-\s]+$/.test(line));
    return utils.cleanMessageText(lines.join("\n"));
  }

  function isComposerNode(el) {
    return Boolean(el.closest("textarea") || el.closest("[role='textbox']") || el.closest("form"));
  }

  function isNoiseNode(el) {
    const text = (el.innerText || "").trim();
    if (!text) {
      return true;
    }
    if (/^[:：\-\s]+$/.test(text)) {
      return true;
    }
    return false;
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
