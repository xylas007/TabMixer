// TabMixer Content Script
// Injects into web pages to control audio volume via Web Audio API

(function() {
  'use strict';

  // State management
  let gainNodes = new Map();
  let mediaElements = new Map();
  let currentVolume = 100;

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAudioControl);
  } else {
    initAudioControl();
  }

  function initAudioControl() {
    // Find all media elements
    findMediaElements();

    // Listen for new media elements (for single-page apps)
    observeForNewMediaElements();

    // Listen for messages from popup/background
    chrome.runtime.onMessage.addListener(handleMessage);
  }

  function findMediaElements() {
    const mediaSelectors = ['video', 'audio'];
    
    mediaSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (!mediaElements.has(element)) {
          setupMediaElement(element);
        }
      });
    });
  }

  function observeForNewMediaElements() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check the node itself
            if (node.matches && (node.matches('video') || node.matches('audio'))) {
              setupMediaElement(node);
            }
            
            // Check children
            const media = node.querySelectorAll && node.querySelectorAll('video, audio');
            if (media) {
              media.forEach(element => {
                if (!mediaElements.has(element)) {
                  setupMediaElement(element);
                }
              });
            }
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function setupMediaElement(element) {
    // Skip if already setup
    if (mediaElements.has(element)) {
      return;
    }

    try {
      // Create AudioContext if needed
      const audioContext = getOrCreateAudioContext();
      
      // Create GainNode for volume control
      const gainNode = audioContext.createGain();
      gainNode.gain.value = currentVolume / 100;
      
      // Store references
      mediaElements.set(element, { audioContext, gainNode });
      gainNodes.set(element, gainNode);

      // Connect elements based on their state
      connectMediaElement(element, audioContext, gainNode);

      // Handle element removal
      element.addEventListener('emptied', () => {
        setTimeout(() => {
          if (element.parentNode) {
            reconnectMediaElement(element);
          } else {
            cleanupElement(element);
          }
        }, 100);
      });

      // Reconnect when media source changes
      element.addEventListener('loadedmetadata', () => {
        reconnectMediaElement(element);
      });

      // Cleanup when element is removed from DOM
      const removeObserver = new MutationObserver(() => {
        if (!document.body.contains(element)) {
          removeObserver.disconnect();
          cleanupElement(element);
        }
      });
      removeObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
      });

    } catch (error) {
      console.warn('TabMixer: Could not setup audio control for element:', error);
    }
  }

  let sharedAudioContext = null;

  function getOrCreateAudioContext() {
    if (!sharedAudioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        sharedAudioContext = new AudioContextClass();
      }
    }
    return sharedAudioContext;
  }

  function connectMediaElement(element, audioContext, gainNode) {
    try {
      // Check if element has a source
      if (element.src || element.currentSrc) {
        // For elements with src attribute
        const source = audioContext.createMediaElementSource(element);
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
      } else if (element.captureStream) {
        // For elements with captureStream (live streams)
        const stream = element.captureStream();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
      }
      // Note: For elements that dynamically load sources, reconnection happens in loadedmetadata handler
    } catch (error) {
      // Element might not be ready or supported
      console.debug('TabMixer: Could not connect media element:', error.message);
    }
  }

  function reconnectMediaElement(element) {
    const data = mediaElements.get(element);
    if (!data) return;

    // Clean up old connections
    disconnectMediaElement(element);

    // Reconnect
    connectMediaElement(element, data.audioContext, data.gainNode);
  }

  function disconnectMediaElement(element) {
    const data = mediaElements.get(element);
    if (!data) return;

    try {
      // Note: We can't easily disconnect MediaElementSource nodes, 
      // but they can only be connected to one destination anyway
    } catch (error) {
      console.debug('TabMixer: Could not disconnect media element:', error.message);
    }
  }

  function cleanupElement(element) {
    const data = mediaElements.get(element);
    if (data) {
      try {
        // Disconnect gain node
        data.gainNode.disconnect();
      } catch (error) {
        // Ignore
      }
      mediaElements.delete(element);
      gainNodes.delete(element);
    }
  }

  function setVolume(volume) {
    currentVolume = Math.max(0, Math.min(600, volume));

    // Update all gain nodes
    gainNodes.forEach((gainNode) => {
      try {
        gainNode.gain.value = currentVolume / 100;
      } catch (error) {
        console.debug('TabMixer: Could not set gain value:', error.message);
      }
    });
  }

  function applyVolume(volume) {
    setVolume(volume);
  }

  function handleMessage(message, sender, sendResponse) {
    switch (message.action) {
      case 'setVolume':
        setVolume(message.volume);
        sendResponse({ success: true });
        break;
      
      case 'applyVolume':
        applyVolume(message.volume);
        sendResponse({ success: true });
        break;
      
      case 'getVolume':
        sendResponse({ success: true, volume: currentVolume });
        break;
      
      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
    
    // Return true to indicate we'll send response asynchronously
    return true;
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (sharedAudioContext) {
      try {
        sharedAudioContext.close();
      } catch (error) {
        // Ignore
      }
    }
    mediaElements.clear();
    gainNodes.clear();
  });

})();
