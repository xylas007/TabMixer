// Background Service Worker for TabMixer Extension
// Handles cleanup and storage management for closed tabs

// Clean up storage when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  const storageKey = `tab_volume_${tabId}`;
  chrome.storage.local.get([storageKey], (result) => {
    if (result[storageKey]) {
      chrome.storage.local.remove(storageKey);
      console.log(`TabMixer: Cleaned up volume data for closed tab ${tabId}`);
    }
  });
});

// Handle tab updates - re-inject content script if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Check if we have a saved volume for this tab
    const storageKey = `tab_volume_${tabId}`;
    chrome.storage.local.get([storageKey], (result) => {
      if (result[storageKey] !== undefined) {
        // Tab has a saved volume setting, inject content script to apply it
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['scripts/content.js']
        }).then(() => {
          // Send message to apply saved volume
          chrome.tabs.sendMessage(tabId, {
            action: 'applyVolume',
            volume: result[storageKey]
          });
        }).catch((error) => {
          // Ignore errors for tabs that can't be injected (like chrome:// URLs)
          console.log(`TabMixer: Could not inject into tab ${tabId}:`, error.message);
        });
      }
    });
  }
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'saveVolume') {
    const storageKey = `tab_volume_${message.tabId}`;
    chrome.storage.local.set({
      [storageKey]: message.volume
    }, () => {
      sendResponse({ success: true });
    });
    return true; // Keep message channel open for async response
  }
  
  if (message.action === 'getVolume') {
    const storageKey = `tab_volume_${message.tabId}`;
    chrome.storage.local.get([storageKey], (result) => {
      sendResponse({ 
        success: true, 
        volume: result[storageKey] || 100 
      });
    });
    return true; // Keep message channel open for async response
  }
  
  if (message.action === 'getAllTabVolumes') {
    chrome.storage.local.get(null, (result) => {
      const volumes = {};
      Object.keys(result).forEach(key => {
        if (key.startsWith('tab_volume_')) {
          const tabId = key.replace('tab_volume_', '');
          volumes[tabId] = result[key];
        }
      });
      sendResponse({ success: true, volumes: volumes });
    });
    return true;
  }
});
