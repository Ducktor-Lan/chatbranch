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

  function linkDensity(el) {
    const text = normalizeText(el.innerText || el.textContent || "");
    if (!text) {
      return 1;
    }
    let linkTextLen = 0;
    const links = el.querySelectorAll("a");
    for (const link of links) {
      linkTextLen += normalizeText(link.textContent || "").length;
    }
    return linkTextLen / Math.max(1, text.length);
  }

  function extractBestText(el, selectors) {
    const candidates = [];
    if (Array.isArray(selectors)) {
      for (const selector of selectors) {
        const node = el.querySelector(selector);
        if (node) {
          candidates.push(node);
        }
      }
    }
    candidates.push(el);

    let best = "";
    for (const node of candidates) {
      const text = cleanMessageText(node.innerText || node.textContent || "");
      if (text.length > best.length) {
        best = text;
      }
    }
    return best;
  }

  function looksLikeMessageContainer(el) {
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
    if (linkDensity(el) > 0.7) {
      return false;
    }
    const buttons = el.querySelectorAll("button").length;
    if (buttons > 8 && text.length < 200) {
      return false;
    }
    return true;
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

  /**
   * 检查节点是否在公式容器内部
   * @param {Node} node - DOM 节点
   * @returns {boolean}
   */
  function isInsideMathContainer(node) {
    const selectors = '.katex, mjx-container, katex-element, .katex-mathml, .katex-html';
    if (node.parentElement) {
      return node.parentElement.closest(selectors) !== null;
    }
    return false;
  }

  /**
   * 检查节点本身是否是公式容器
   * @param {Node} node - DOM 节点
   * @returns {boolean}
   */
  function isMathContainer(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const el = node;
    return (el.classList && el.classList.contains('katex')) ||
           (el.tagName && el.tagName.toLowerCase() === 'mjx-container') ||
           (el.tagName && el.tagName.toLowerCase() === 'katex-element');
  }

  /**
   * 检查字符串是否只包含空白字符（包括零宽字符）
   * @param {string} text - 文本
   * @returns {boolean}
   */
  function isOnlyWhitespace(text) {
    return /^[\s\u200B\u200C\u200D\uFEFF]*$/.test(text);
  }

  /**
   * 从元素中提取文本，将渲染后的公式替换为 LaTeX 源码
   * 使用克隆替换策略，避免 DOM 遍历的复杂性
   * @param {HTMLElement} el - 包含公式的元素
   * @param {string} rawText - 原始文本（innerText 或 textContent）
   * @returns {string} - 替换后的文本
   */
  function extractTextWithLatex(el, rawText) {
    if (!el) return rawText || "";

    // 检查是否有公式容器
    const mathContainers = el.querySelectorAll('.katex, mjx-container, katex-element');
    if (!mathContainers.length) {
      return rawText || "";
    }

    // 克隆 DOM 以避免修改原始页面
    const clone = el.cloneNode(true);
    const cloneContainers = clone.querySelectorAll('.katex, mjx-container, katex-element');

    // 收集 LaTeX 源码或后备文本映射
    const latexMap = new Map();
    mathContainers.forEach((container, index) => {
      const latex = extractLatexFromContainer(container);
      if (latex) {
        latexMap.set(index, latex);
      } else {
        // 后备：使用渲染后的文本（清理零宽字符）
        const fallback = (container.textContent || "")
          .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (fallback) {
          latexMap.set(index, `[${fallback}]`);
        }
      }
    });

    // 在克隆中用占位符替换公式容器
    cloneContainers.forEach((container, index) => {
      if (latexMap.has(index)) {
        const placeholder = document.createTextNode(`__MATH${index}__`);
        container.parentNode.replaceChild(placeholder, container);
      }
    });

    // 获取处理后的文本
    let result = clone.innerText || clone.textContent || "";

    // 还原公式
    latexMap.forEach((latex, index) => {
      result = result.replace(`__MATH${index}__`, latex);
    });

    // 清理残留的零宽字符和多余空白
    result = result
      .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
      .replace(/[ \t]+/g, ' ')
      .trim();

    return result || rawText || "";
  }

  /**
   * 从公式容器中提取 LaTeX 源码
   * @param {HTMLElement} container - 公式容器元素
   * @returns {string} - LaTeX 源码（带分隔符）
   */
  function extractLatexFromContainer(container) {
    if (!container || container.nodeType !== Node.ELEMENT_NODE) return "";

    // 检查是否是公式容器
    const isMathEl =
      (container.classList && container.classList.contains('katex')) ||
      (container.tagName && container.tagName.toLowerCase() === 'mjx-container') ||
      (container.tagName && container.tagName.toLowerCase() === 'katex-element');

    if (!isMathEl) return "";

    // 优先从 annotation 获取（最可靠）
    const ann = container.querySelector('annotation');
    if (ann && ann.textContent) {
      return normalizeLatexDelimiter(ann.textContent.trim());
    }

    // 备选：从 .katex-mathml 的 annotation 获取
    const mathml = container.querySelector('.katex-mathml annotation');
    if (mathml && mathml.textContent) {
      return normalizeLatexDelimiter(mathml.textContent.trim());
    }

    // 对于 MathJax，尝试从 data 属性获取
    const dataLatex = container.getAttribute('data-latex') ||
                      container.getAttribute('data-mathml');
    if (dataLatex) {
      return normalizeLatexDelimiter(dataLatex);
    }

    // 最后尝试 aria-label
    const ariaLabel = container.getAttribute('aria-label');
    if (ariaLabel && /\\|\^|_|\{|\}/.test(ariaLabel)) {
      return normalizeLatexDelimiter(ariaLabel.trim());
    }

    return "";
  }

  /**
   * 规范化 LaTeX 分隔符
   * @param {string} latex - LaTeX 源码
   * @returns {string} - 带分隔符的 LaTeX
   */
  function normalizeLatexDelimiter(latex) {
    const text = String(latex || "").trim();
    if (!text) return "";

    // 移除已有的分隔符
    const stripped = text.replace(/^\$+|\$+$/g, "").trim();
    if (!stripped) return "";

    // 判断是否块级公式
    const isBlock = /\\begin\{|\\end\{|\n/.test(stripped);
    return isBlock ? `$$${stripped}$$` : `$${stripped}$`;
  }

  global.ChatBranchAdapterUtils = {
    uniqueElements,
    pruneNestedElements,
    normalizeText,
    cleanMessageText,
    isLikelyNavigationNode,
    isLikelyUrlOnlyText,
    linkDensity,
    extractBestText,
    looksLikeMessageContainer,
    inferRoleCommon,
    stableNodeHash,
    shouldTreatAsMessage,
    extractTextWithLatex,
    extractLatexFromContainer,
    normalizeLatexDelimiter
  };
})(window);
