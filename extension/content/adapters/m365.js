(function registerM365(global) {
  const siteKey = "m365";
  const utils = global.ChatBranchAdapterUtils;

  function match(locationObj) {
    return locationObj.hostname === "m365.cloud.microsoft";
  }

  function getScrollContainer() {
    return document.querySelector("main") || document.scrollingElement || window;
  }

  function getMessageElements() {
    const root =
      document.querySelector("main") ||
      document.querySelector("[role='main']") ||
      document;

    const selectors = [
      "div[data-content]",
      "div[role='listitem']",
      "article",
      "[data-message-author-role]",
      "[data-role]",
      "[data-testid*='message']",
      "[data-testid*='turn']",
      "[class*='message']",
      "[class*='chat-item']",
      "[class*='turn']",
      "[class*='user']",
      "[class*='assistant']",
      "[class*='copilot']"
    ];

    const raw = utils.uniqueElements(selectors, root);
    const elements = utils.pruneNestedElements(raw);

    return elements.filter((el) => {
      if (!utils.shouldTreatAsMessage(el) || !utils.looksLikeMessageContainer(el)) {
        return false;
      }
      const text = getText(el);
      if (!text || utils.isLikelyUrlOnlyText(text)) {
        return false;
      }
      return getRole(el) !== "unknown";
    });
  }

  function getRole(el) {
    const roleAttr =
      el.getAttribute("data-message-author-role") ||
      el.getAttribute("data-role") ||
      el.getAttribute("role") ||
      "";
    if (/user|human|question|query|me|you/i.test(roleAttr)) {
      return "user";
    }
    if (/assistant|ai|copilot|model|answer/i.test(roleAttr)) {
      return "assistant";
    }

    const token = `${el.className || ""} ${el.getAttribute("aria-label") || ""}`.toLowerCase();
    if (token.includes("user") || token.includes("question") || token.includes("prompt") || token.includes("query")) {
      return "user";
    }
    if (token.includes("assistant") || token.includes("copilot") || token.includes("answer") || token.includes("response")) {
      return "assistant";
    }

    const common = utils.inferRoleCommon(el);
    if (common !== "unknown") {
      return common;
    }

    const text = utils.cleanMessageText(el.innerText || "");
    if (/^you\s*:/i.test(text) || /^你[：:]/.test(text) || /^请|^帮我|^给我|^解释/.test(text)) {
      return "user";
    }
    if (/^copilot\s*:/i.test(text) || /^当然|^好的|^可以|^以下/.test(text)) {
      return "assistant";
    }
    return "unknown";
  }

  function getText(el) {
    return utils.extractBestText(el, [
      "[data-testid*='message-content']",
      "[data-testid*='question']",
      "[data-testid*='answer']",
      "[data-role='message-content']",
      "[class*='message-content']",
      "[class*='content']",
      "[class*='markdown']",
      "[class*='prose']"
    ]);
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
