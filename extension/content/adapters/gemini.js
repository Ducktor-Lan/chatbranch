(function registerGemini(global) {
  const siteKey = "gemini";
  const utils = global.ChatBranchAdapterUtils;

  function match(locationObj) {
    return locationObj.hostname === "gemini.google.com";
  }

  function getScrollContainer() {
    return document.querySelector("main") || window;
  }

  function getMessageElements() {
    const selectors = [
      "chat-turn user-query",
      "user-query",
      "chat-turn model-response",
      "model-response",
      "[data-message-author-role]",
      "[data-role]"
    ];
    const raw = utils.uniqueElements(selectors);
    const elements = utils.pruneNestedElements(raw);
    return elements.filter((el) => {
      if (!utils.shouldTreatAsMessage(el)) {
        return false;
      }
      const role = getRole(el);
      return role !== "unknown";
    });
  }

  function getRole(el) {
    const tag = el.tagName.toLowerCase();
    if (tag.includes("user-query")) {
      return "user";
    }
    if (tag.includes("model-response")) {
      return "assistant";
    }

    const token = `${el.className || ""} ${el.getAttribute("aria-label") || ""}`.toLowerCase();
    if (token.includes("user-query") || token.includes("user") || token.includes("query")) {
      return "user";
    }
    if (token.includes("model-response") || token.includes("assistant") || token.includes("gemini")) {
      return "assistant";
    }

    return utils.inferRoleCommon(el);
  }

  function getText(el) {
    const preferred =
      el.querySelector(".query-text") ||
      el.querySelector(".model-response-text") ||
      el.querySelector(".markdown") ||
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
    return location.pathname || null;
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
