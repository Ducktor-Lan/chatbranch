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
      "[id^='user-message-']",
      ".fai-UserMessage__message",
      "[data-testid='copilot-message-div']",
      "[data-testid='copilot-message-reply-div']",
      "[data-testid='loading-message']",
      "div[role='listitem']",
      "[data-message-author-role]",
      "[data-role]",
      "[class*='fai-UserMessage']",
      "[class*='copilot-message']"
    ];

    const raw = utils.uniqueElements(selectors, root);
    const elements = utils.pruneNestedElements(raw);

    return elements.filter((el) => {
      if (!isDirectMessageNode(el)) {
        return false;
      }
      if (!utils.shouldTreatAsMessage(el) || !utils.looksLikeMessageContainer(el)) {
        return false;
      }
      if (isInComposerArea(el)) {
        return false;
      }
      if (isCompositeContainer(el)) {
        return false;
      }
      const text = getText(el);
      if (!text || utils.isLikelyUrlOnlyText(text)) {
        return false;
      }
      const role = getRole(el);
      if (role === "unknown") {
        return false;
      }
      if (role === "user" && !isMeaningfulUserText(text)) {
        return false;
      }
      if (role === "assistant" && !isMeaningfulAssistantText(text)) {
        return false;
      }
      return true;
    });
  }

  function isDirectMessageNode(el) {
    const id = (el.id || "").toLowerCase();
    const cls = (el.className || "").toString().toLowerCase();
    const dataTestId = (el.getAttribute("data-testid") || "").toLowerCase();

    if (id.startsWith("user-message-")) {
      return true;
    }
    if (cls.includes("fai-usermessage__message") || cls.includes("fai-usermessage")) {
      return true;
    }
    if (
      dataTestId === "copilot-message-div" ||
      dataTestId === "copilot-message-reply-div" ||
      dataTestId === "loading-message"
    ) {
      return true;
    }
    return false;
  }

  function isInComposerArea(el) {
    return Boolean(
      el.closest("[role='textbox']") ||
        el.closest("[aria-label*='发送消息']") ||
        el.closest("[aria-label*='message']") ||
        el.closest("[id*='editor']") ||
        el.closest("[id*='composer']") ||
        el.closest("[class*='EditorInput']") ||
        el.closest("form")
    );
  }

  function isMeaningfulUserText(text) {
    const value = String(text || "").trim();
    if (value.length < 2) {
      return false;
    }
    if (/^[:：\-\s]+$/.test(value)) {
      return false;
    }
    const alphaNum = value.replace(/[^\p{L}\p{N}\u4e00-\u9fff]/gu, "");
    return alphaNum.length >= 2;
  }

  function isMeaningfulAssistantText(text) {
    const value = String(text || "").trim();
    if (value.length < 4) {
      return false;
    }
    if (/^[:：\-\s]+$/.test(value)) {
      return false;
    }
    return true;
  }

  function getRole(el) {
    const dataTestId = (el.getAttribute("data-testid") || "").toLowerCase();
    const id = (el.id || "").toLowerCase();
    const cls = (el.className || "").toString().toLowerCase();

    if (id.startsWith("user-message-") || cls.includes("fai-usermessage") || cls.includes("user-message")) {
      return "user";
    }
    if (
      dataTestId === "copilot-message-div" ||
      dataTestId === "copilot-message-reply-div" ||
      dataTestId === "loading-message" ||
      cls.includes("copilot-message")
    ) {
      return "assistant";
    }

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
    let text = utils.extractBestText(el, [
      "[data-testid*='message-content']",
      "[data-testid*='question']",
      "[data-testid*='answer']",
      ".fai-UserMessage__message",
      "[data-role='message-content']",
      "[class*='message-content']",
      "[class*='content']",
      "[class*='markdown']",
      "[class*='prose']"
    ]);
    text = text
      .replace(/^you\s*said\s*:\s*/i, "")
      .replace(/^copilot\s*said\s*:\s*/i, "")
      .trim();
    return text;
  }

  function isCompositeContainer(el) {
    const dataTestId = (el.getAttribute("data-testid") || "").toLowerCase();
    const id = (el.id || "").toLowerCase();
    const text = (el.innerText || "").toLowerCase();
    if (dataTestId === "m365-chat-llm-web-ui-chat-message") {
      return true;
    }
    if (id.startsWith("chatmessagecontainer")) {
      return true;
    }
    if (text.includes("you said:") && text.includes("copilot said:")) {
      return true;
    }
    return false;
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
