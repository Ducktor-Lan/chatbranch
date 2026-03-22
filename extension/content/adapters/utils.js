(function initAdapterUtils(global) {
  function uniqueElements(selectors, root) {
    const source = root || document;
    const set = new Set();
    const output = [];
    for (const selector of selectors) {
      const nodes = source.querySelectorAll(selector);
      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }
        if (!set.has(node)) {
          set.add(node);
          output.push(node);
        }
      }
    }
    return output;
  }

  function pruneNestedElements(elements) {
    const kept = [];
    for (const el of elements) {
      let nested = false;
      for (const parent of kept) {
        if (parent.contains(el)) {
          nested = true;
          break;
        }
      }
      if (!nested) {
        kept.push(el);
      }
    }
    return kept;
  }

  function normalizeText(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function cleanMessageText(text) {
    let output = normalizeText(text);
    output = output.replace(/^(you said|you:|user:|你说|你：|我说|我：)\s*/i, "");
    output = output.replace(/^(已深度思考|思考中|thinking)\s*/i, "");
    return output.trim();
  }

  function isLikelyNavigationNode(el) {
    if (el.closest("nav, aside, header, footer")) {
      return true;
    }
    const links = el.querySelectorAll("a");
    const text = normalizeText(el.innerText || el.textContent || "");
    if (links.length >= 3 && text.length < 180) {
      return true;
    }
    return false;
  }

  function isLikelyUrlOnlyText(text) {
    const value = normalizeText(text);
    if (!value) {
      return false;
    }
    if (value.length <= 120 && /^https?:\/\//i.test(value)) {
      return true;
    }
    return false;
  }

  function elementToken(el) {
    return `${el.className || ""} ${el.getAttribute("aria-label") || ""} ${(el.dataset && JSON.stringify(el.dataset)) || ""}`.toLowerCase();
  }

  function inferRoleCommon(el) {
    const roleAttr =
      el.getAttribute("data-message-author-role") ||
      el.getAttribute("data-role") ||
      el.getAttribute("role") ||
      "";
    const role = roleAttr.toLowerCase();
    if (/\buser\b|\bhuman\b|\bself\b|\bme\b/.test(role)) {
      return "user";
    }
    if (/\bassistant\b|\bbot\b|\bai\b|\bmodel\b/.test(role)) {
      return "assistant";
    }

    const token = elementToken(el);
    if (/\buser\b|\bhuman\b|\bquery\b/.test(token)) {
      return "user";
    }
    if (/\bassistant\b|\banswer\b|\bbot\b|\bmodel\b|\bgemini\b/.test(token)) {
      return "assistant";
    }
    return "unknown";
  }

  function stableNodeHash(el, fallback) {
    const base =
      el.getAttribute("data-testid") ||
      el.getAttribute("data-message-id") ||
      el.getAttribute("id") ||
      fallback ||
      el.innerText ||
      el.textContent ||
      "";
    let hash = 0;
    for (let i = 0; i < base.length; i += 1) {
      hash = (hash << 5) - hash + base.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }

  function shouldTreatAsMessage(el) {
    if (isLikelyNavigationNode(el)) {
      return false;
    }
    const text = normalizeText(el.innerText || el.textContent || "");
    if (text.length < 2) {
      return false;
    }
    if (isLikelyUrlOnlyText(text)) {
      return false;
    }
    const token = elementToken(el);
    if (token.includes("toolbar") || token.includes("avatar") || token.includes("footer")) {
      return false;
    }
    return true;
  }

  global.ChatBranchAdapterUtils = {
    uniqueElements,
    pruneNestedElements,
    normalizeText,
    cleanMessageText,
    isLikelyNavigationNode,
    isLikelyUrlOnlyText,
    inferRoleCommon,
    stableNodeHash,
    shouldTreatAsMessage
  };
})(window);
