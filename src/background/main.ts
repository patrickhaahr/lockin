import { ensureExtensionState } from "@/shared/storage";

function initializeExtensionState(): void {
  void ensureExtensionState();
}

chrome.runtime.onInstalled.addListener(initializeExtensionState);
chrome.runtime.onStartup.addListener(initializeExtensionState);
