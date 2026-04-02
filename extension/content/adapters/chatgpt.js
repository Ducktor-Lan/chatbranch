(function registerChatGPT(global) {
  const siteKey = "chatgpt";
  const utils = global.ChatBranchAdapterUtils;

  function match(locationObj) {
    return (
      locationObj.hostname === "chatgpt.com" ||
      locationObj.hostname === "chat.openai.com"
    );
  }

  function getScrollContainer() {
    return window;
  }

  function getMessageElements() {
    const selectors = [
      "[data-message-author-role]",
      "article[data-testid^='conversation-turn-']",
      "main article"
    ];
    return utils
      .uniqueElements(selectors)
      .filter((el) => el.querySelector("[data-message-author-role]") || utils.shouldTreatAsMessage(el));
  }

  function getRole(el) {
    const author =
      el.getAttribute("data-message-author-role") ||
      el.querySelector("[data-message-author-role]")?.getAttribute("data-message-author-role") ||
      "";
    if (author === "user") {
      return "user";
    }
    if (author === "assistant") {
      return "assistant";
    }
    const maybe = utils.inferRoleCommon(el);
    if (maybe !== "unknown") {
      return maybe;
    }
    return inferRoleFromClasses(el);
  }

  function getText(el) {
    const candidate =
      el.querySelector("[data-message-author-role]") ||
      el.querySelector(".markdown") ||
      el;
    const rawText = candidate.innerText || candidate.textContent || "";
    return utils.cleanMessageText(utils.extractTextWithLatex(candidate, rawText));
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
    const matchId = location.pathname.match(/\/c\/([^/]+)/);
    return matchId ? matchId[1] : null;
  }

  function inferRoleFromClasses(el) {
    const token = `${el.className} ${el.getAttribute("aria-label") || ""}`.toLowerCase();
    if (token.includes("assistant") || token.includes("bot") || token.includes("model")) {
      return "assistant";
    }
    if (token.includes("user") || token.includes("human") || token.includes("me")) {
      return "user";
    }
    return "unknown";
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
