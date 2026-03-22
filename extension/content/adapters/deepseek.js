(function registerDeepSeek(global) {
  const siteKey = "deepseek";
  const utils = global.ChatBranchAdapterUtils;

  function match(locationObj) {
    return locationObj.hostname === "chat.deepseek.com" || locationObj.hostname === "www.deepseek.com";
  }

  function getScrollContainer() {
    return document.querySelector("main") || document.scrollingElement || window;
  }

  function getMessageElements() {
    const root = document.querySelector("main") || document;
    const selectors = [
      "chat-turn",
      "div[role='listitem']",
      "article",
      "[data-message-author-role]",
      "[data-role]",
      "[class*='message']",
      "[class*='chat-item']",
      "[class*='user']",
      "[class*='assistant']"
    ];

    const raw = utils.uniqueElements(selectors, root);
    const elements = utils.pruneNestedElements(raw);
    return elements.filter((el) => {
      if (!utils.shouldTreatAsMessage(el) || utils.isLikelyNavigationNode(el)) {
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
    if (/user|human|question|query|me/i.test(roleAttr)) {
      return "user";
    }
    if (/assistant|ai|model|answer|deepseek/i.test(roleAttr)) {
      return "assistant";
    }

    const role = utils.inferRoleCommon(el);
    if (role !== "unknown") {
      return role;
    }

    const token = `${el.className || ""} ${el.getAttribute("aria-label") || ""}`.toLowerCase();
    if (token.includes("user") || token.includes("question") || token.includes("query")) {
      return "user";
    }
    if (token.includes("assistant") || token.includes("deepseek") || token.includes("ai")) {
      return "assistant";
    }
    return "unknown";
  }

  function getText(el) {
    const preferred =
      el.querySelector("[data-testid*='message-content']") ||
      el.querySelector("[class*='message-content']") ||
      el.querySelector("[class*='markdown']") ||
      el;
    return utils.cleanMessageText(preferred.innerText || preferred.textContent || "");
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
