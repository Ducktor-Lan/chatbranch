const STORAGE_KEY = "chatbranch:settings";
const defaults = {
  overlayTtlMs: 8000,
  debugMode: false,
  quickAskTarget: "same-site",
  commonCommands: [
    "总结上文关键结论",
    "提取可执行行动清单",
    "用更简洁的表达重写",
    "翻译成英文"
  ]
};

async function load() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const settings = { ...defaults, ...(data[STORAGE_KEY] || {}) };
  document.getElementById("overlayTtlMs").value = settings.overlayTtlMs;
  document.getElementById("debugMode").checked = Boolean(settings.debugMode);
  document.getElementById("quickAskTarget").value = settings.quickAskTarget || "same-site";
  document.getElementById("commonCommands").value = (settings.commonCommands || []).join("\n");
}

async function save() {
  const settings = {
    overlayTtlMs: Number(document.getElementById("overlayTtlMs").value) || defaults.overlayTtlMs,
    debugMode: document.getElementById("debugMode").checked,
    quickAskTarget: document.getElementById("quickAskTarget").value || "same-site",
    commonCommands: document
      .getElementById("commonCommands")
      .value.split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
  const status = document.getElementById("status");
  status.textContent = "Saved";
  setTimeout(() => {
    status.textContent = "";
  }, 1200);
}

document.getElementById("saveBtn").addEventListener("click", () => {
  save().catch((error) => {
    document.getElementById("status").textContent = String(error);
  });
});

load().catch((error) => {
  document.getElementById("status").textContent = String(error);
});
