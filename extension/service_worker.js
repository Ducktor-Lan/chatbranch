const MENU_ID = "chatbranch-quick-ask";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "ChatBranch: Ask In New Tab",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) {
    return;
  }
  if (info.menuItemId === MENU_ID) {
    chrome.tabs.sendMessage(tab.id, {
      type: "CHATBRANCH_OPEN_QUICKASK_DIALOG",
      selectionText: info.selectionText || ""
    });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return;
  }

  if (command === "quick-ask") {
    chrome.tabs.sendMessage(tab.id, {
      type: "CHATBRANCH_OPEN_QUICKASK_DIALOG",
      selectionText: ""
    });
    return;
  }
  if (command === "toggle-panel") {
    chrome.tabs.sendMessage(tab.id, { type: "CHATBRANCH_TOGGLE_PANEL" });
    return;
  }
  if (command === "focus-search") {
    chrome.tabs.sendMessage(tab.id, { type: "CHATBRANCH_FOCUS_SEARCH" });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "CHATBRANCH_OPEN_TAB") {
    return;
  }
  chrome.tabs.create({ url: message.url, active: true }, () => {
    sendResponse({ ok: true });
  });
  return true;
});
