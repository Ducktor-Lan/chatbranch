(function registerM365(global) {
  const siteKey = "m365";
  const utils = global.ChatBranchAdapterUtils;

  function match(locationObj) {
    return locationObj.hostname === "m365.cloud.microsoft";
  }

  function getScrollContainer() {
    const root =
      document.querySelector("main") ||
      document.querySelector("[role='main']") ||
      document;

    const messageSelectors = [
      "[id^='user-message-']",
      ".fai-UserMessage__message",
      "[data-testid='copilot-message-div']",
      "[data-testid='copilot-message-reply-div']",
      "[data-testid='loading-message']"
    ];

    for (const selector of messageSelectors) {
      const node = root.querySelector(selector) || document.querySelector(selector);
      const container = findScrollableAncestor(node);
      if (container) {
        return container;
      }
    }

    const main = document.querySelector("main") || document.querySelector("[role='main']");
    const fromMain = findScrollableAncestor(main);
    if (fromMain) {
      return fromMain;
    }

    return document.scrollingElement || window;
  }

  function findScrollableAncestor(node) {
    let current = node instanceof HTMLElement ? node.parentElement : null;
    while (current && current !== document.body && current !== document.documentElement) {
      if (isScrollableElement(current)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
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

    const candidates = [];
    for (const el of elements) {
      if (!isDirectMessageNode(el)) {
        continue;
      }
      if (!utils.shouldTreatAsMessage(el) || !utils.looksLikeMessageContainer(el)) {
        continue;
      }
      if (isInComposerArea(el) || isCompositeContainer(el)) {
        continue;
      }

      const text = getText(el);
      if (!text || utils.isLikelyUrlOnlyText(text)) {
        continue;
      }

      const role = getRole(el);
      if (role === "unknown") {
        continue;
      }
      if (role === "user" && !isMeaningfulUserText(text)) {
        continue;
      }
      if (role === "assistant" && !isMeaningfulAssistantText(text)) {
        continue;
      }

      candidates.push({ el, role, text, dataTestId: (el.getAttribute("data-testid") || "").toLowerCase() });
    }

    const seen = new Set();
    const output = [];
    for (const item of candidates) {
      const key = `${item.role}|${item.text.replace(/\s+/g, " ").trim()}`;
      if (seen.has(key)) {
        continue;
      }
      if (item.dataTestId === "loading-message" && hasSameAssistantText(candidates, item.text, item.el)) {
        continue;
      }
      seen.add(key);
      output.push(item.el);
    }
    return output;
  }

  function hasSameAssistantText(candidates, text, currentEl) {
    const normalized = text.replace(/\s+/g, " ").trim();
    for (const item of candidates) {
      if (item.el === currentEl) {
        continue;
      }
      if (item.role !== "assistant") {
        continue;
      }
      const t = item.text.replace(/\s+/g, " ").trim();
      if (t === normalized) {
        return true;
      }
    }
    return false;
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
    if (/^[:：\-\s]+\S*$/.test(value) && value.length <= 6) {
      return false;
    }
    if (/^\S+[:：]\s*$/.test(value)) {
      return false;
    }
    if (/^https?:\/\//i.test(value) && value.length < 140) {
      return false;
    }
    const valueNoLinks = value.replace(/https?:\/\/\S+/g, "").trim();
    if (valueNoLinks.length < 2) {
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
    if (/user|human|question|query|me/i.test(roleAttr)) {
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

    const text = cleanupM365Text(el.innerText || "");
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
    text = cleanupM365Text(text);
    return text;
  }

  function cleanupM365Text(raw) {
    const lines = String(raw || "")
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^you\s*said\s*:?$/i.test(line))
      .filter((line) => !/^copilot\s*said\s*:?$/i.test(line))
      .filter((line) => !/^copilot$/i.test(line))
      .filter((line) => !/^\d{1,2}月\s*\d{1,2}$/i.test(line))
      .filter((line) => !/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(line))
      .filter((line) => !/^[:：\-\s]+$/.test(line));

    return utils.cleanMessageText(lines.join("\n"));
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
