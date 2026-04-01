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

// Handle keyboard shortcut commands
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]?.id) {
      return;
    }
    const tabId = tabs[0].id;

    switch (command) {
      case "toggle-panel":
        chrome.tabs.sendMessage(tabId, { type: "CHATBRANCH_TOGGLE_PANEL" });
        break;
      case "quick-ask":
        // Get selection from the active tab first
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: () => window.getSelection().toString()
        }, (results) => {
          const selection = results?.[0]?.result || "";
          chrome.tabs.sendMessage(tabId, {
            type: "CHATBRANCH_OPEN_QUICKASK_DIALOG",
            selectionText: selection
          });
        });
        break;
      case "focus-search":
        chrome.tabs.sendMessage(tabId, { type: "CHATBRANCH_FOCUS_SEARCH" });
        break;
    }
  });
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
