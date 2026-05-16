import { createEmptyExtensionState, normalizeExtensionState } from "./state";
import type { ExtensionState } from "./types";

const EXTENSION_STATE_KEY = "lockInState";

export async function readExtensionState(): Promise<ExtensionState> {
  return normalizeExtensionState(await readStoredState());
}

export async function writeExtensionState(state: ExtensionState): Promise<void> {
  await chrome.storage.local.set({
    [EXTENSION_STATE_KEY]: state,
  });
}

export async function ensureExtensionState(): Promise<ExtensionState> {
  const storedState = await readStoredState();
  const normalizedState = normalizeExtensionState(storedState);

  if (storedState === undefined) {
    const emptyState = createEmptyExtensionState();
    await writeExtensionState(emptyState);
    return emptyState;
  }

  if (JSON.stringify(storedState) !== JSON.stringify(normalizedState)) {
    await writeExtensionState(normalizedState);
  }

  return normalizedState;
}

async function readStoredState(): Promise<unknown> {
  const storedItems = await chrome.storage.local.get(EXTENSION_STATE_KEY);
  return storedItems[EXTENSION_STATE_KEY];
}
