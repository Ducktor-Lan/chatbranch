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
    const root =
      document.querySelector("[class*='conversation']") ||
      document.querySelector("[class*='chat-content']") ||
      document.querySelector("main") ||
      document;

    const selectors = [
      "chat-turn",
      "div[role='listitem']",
      "li[role='listitem']",
      "article",
      "[data-message-author-role]",
      "[data-role]",
      "[class*='chat-message']",
      "[class*='message-item']",
      "[class*='user']",
      "[class*='assistant']",
      "[class*='bubble']"
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
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "a") {
      return "unknown";
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

    const role = utils.inferRoleCommon(el);
    if (role !== "unknown") {
      return role;
    }

    const token = `${el.className || ""} ${el.getAttribute("aria-label") || ""}`.toLowerCase();
    if (token.includes("user") || token.includes("question") || token.includes("query")) {
      return "user";
    }
    if (token.includes("assistant") || token.includes("doubao") || token.includes("ai")) {
      return "assistant";
    }

    const text = utils.cleanMessageText(el.innerText || "");
    if (/^我[：:]/.test(text) || /^请|^帮我|^解释|^给我|^请你/.test(text)) {
      return "user";
    }
    if (/^你|^好的|^可以|^当然|^以下/.test(text)) {
      return "assistant";
    }
    return "unknown";
  }

  function getText(el) {
    const preferred =
      el.querySelector("[data-testid*='message-content']") ||
      el.querySelector("[data-role='message-content']") ||
      el.querySelector("[class*='message-content']") ||
      el.querySelector("[class*='bubble-content']") ||
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
