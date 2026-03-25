const STORAGE_KEY = "chatbranch:settings";
const defaults = {
  overlayTtlMs: 8000,
  debugMode: false,
  quickAskTarget: "same-site",
  commonCommands: [
    { title: "总结", content: "总结上文关键结论" },
    { title: "行动清单", content: "提取可执行行动清单" },
    { title: "重写", content: "用更简洁的表达重写" },
    { title: "翻译", content: "翻译成英文" }
  ]
};

function normalizeCommands(commands) {
  if (!Array.isArray(commands)) {
    return [];
  }
  return commands.map(function(cmd) {
    if (typeof cmd === "string") {
      return {
        title: cmd.length > 20 ? cmd.slice(0, 20) + "..." : cmd,
        content: cmd
      };
    }
    return cmd;
  });
}

function createPromptRow(title, content) {
  const row = document.createElement("div");
  row.className = "prompt-row";

  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.className = "prompt-title";
  titleInput.placeholder = "标题";
  titleInput.value = title || "";

  const contentInput = document.createElement("input");
  contentInput.type = "text";
  contentInput.className = "prompt-content";
  contentInput.placeholder = "提示词内容";
  contentInput.value = content || "";

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "delete-btn";
  deleteBtn.textContent = "删除";
  deleteBtn.addEventListener("click", function() {
    row.remove();
  });

  row.appendChild(titleInput);
  row.appendChild(contentInput);
  row.appendChild(deleteBtn);
  return row;
}

function renderPrompts(commands) {
  const list = document.getElementById("prompts-list");
  list.innerHTML = "";

  const normalized = normalizeCommands(commands);
  if (normalized.length === 0) {
    const emptyHint = document.createElement("div");
    emptyHint.className = "empty-hint";
    emptyHint.textContent = "暂无提示词，点击下方按钮添加";
    list.appendChild(emptyHint);
    return;
  }

  for (const cmd of normalized) {
    const row = createPromptRow(cmd.title || "", cmd.content || "");
    list.appendChild(row);
  }
}

function collectPrompts() {
  const list = document.getElementById("prompts-list");
  const rows = list.querySelectorAll(".prompt-row");
  const commands = [];

  for (const row of rows) {
    const titleInput = row.querySelector(".prompt-title");
    const contentInput = row.querySelector(".prompt-content");
    const title = (titleInput.value || "").trim();
    const content = (contentInput.value || "").trim();

    if (content) {
      commands.push({
        title: title || (content.length > 20 ? content.slice(0, 20) + "..." : content),
        content: content
      });
    }
  }

  return commands;
}

function addPromptRow() {
  const list = document.getElementById("prompts-list");
  const emptyHint = list.querySelector(".empty-hint");
  if (emptyHint) {
    emptyHint.remove();
  }
  const row = createPromptRow("", "");
  list.appendChild(row);
  row.querySelector(".prompt-title").focus();
}

async function load() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const settings = { ...defaults, ...(data[STORAGE_KEY] || {}) };
  document.getElementById("overlayTtlMs").value = settings.overlayTtlMs;
  document.getElementById("debugMode").checked = Boolean(settings.debugMode);
  document.getElementById("quickAskTarget").value = settings.quickAskTarget || "same-site";
  renderPrompts(settings.commonCommands || []);
}

async function save() {
  const commands = collectPrompts();

  const settings = {
    overlayTtlMs: Number(document.getElementById("overlayTtlMs").value) || defaults.overlayTtlMs,
    debugMode: document.getElementById("debugMode").checked,
    quickAskTarget: document.getElementById("quickAskTarget").value || "same-site",
    commonCommands: commands
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
  const status = document.getElementById("status");
  status.textContent = "Saved";
  setTimeout(function() {
    status.textContent = "";
  }, 1200);
}

document.getElementById("saveBtn").addEventListener("click", function() {
  save().catch(function(error) {
    document.getElementById("status").textContent = String(error);
  });
});

document.getElementById("addPromptBtn").addEventListener("click", addPromptRow);

load().catch(function(error) {
  document.getElementById("status").textContent = String(error);
});
