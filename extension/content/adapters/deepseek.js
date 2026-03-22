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
      "[data-testid*='chat-message']",
      "[data-testid*='message-item']",
      "[data-testid*='conversation-turn']",
      "chat-turn",
      "div[role='listitem']",
      "li[role='listitem']",
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
    if (token.includes("question") || token.includes("query") || token.includes("prompt")) {
      return "user";
    }
    if (token.includes("response") || token.includes("answer") || token.includes("result")) {
      return "assistant";
    }
    if (token.includes("user") || token.includes("question") || token.includes("query")) {
      return "user";
    }
    if (token.includes("assistant") || token.includes("deepseek") || token.includes("ai")) {
      return "assistant";
    }
    return "unknown";
  }

  function getText(el) {
    return utils.extractBestText(el, [
      "[data-testid*='message-content']",
      "[data-testid*='question']",
      "[data-testid*='answer']",
      "[class*='message-content']",
      "[class*='bubble-content']",
      "[class*='markdown']",
      "[class*='content']"
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
