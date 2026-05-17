import { getBrowserLocalDay } from "./state";
import type { ExtensionState } from "./types";

export function synchronizeBrowserLocalDayState(
  state: ExtensionState,
  now: Date = new Date(),
): {
  didChange: boolean;
  didApplyTransition: boolean;
  state: ExtensionState;
} {
  const currentBrowserLocalDay = getBrowserLocalDay(now);
  const hasPendingProtectedSettingsForPriorDay =
    state.pendingConfig !== null &&
    state.protectedSettingsChangeLock.lastChangedOnBrowserLocalDay !== null &&
    state.protectedSettingsChangeLock.lastChangedOnBrowserLocalDay !== currentBrowserLocalDay;
  const hasPendingBlockedRootRemovalForPriorDay =
    state.blockedRoots.pendingRemoval.length > 0 &&
    state.blockedRoots.pendingRemovalScheduledOnBrowserLocalDay !== null &&
    state.blockedRoots.pendingRemovalScheduledOnBrowserLocalDay !== currentBrowserLocalDay;

  if (state.lastProcessedBrowserLocalDay === currentBrowserLocalDay) {
    return {
      didChange: false,
      didApplyTransition: false,
      state,
    };
  }

  const shouldActivatePendingProtectedSettings = hasPendingProtectedSettingsForPriorDay;
  const shouldActivatePendingBlockedRootRemoval = hasPendingBlockedRootRemovalForPriorDay;
  const shouldResetAllowCache =
    state.verification.allowCacheBrowserLocalDay !== null &&
    state.verification.allowCacheBrowserLocalDay !== currentBrowserLocalDay;
  const didApplyTransition =
    shouldActivatePendingProtectedSettings ||
    shouldActivatePendingBlockedRootRemoval ||
    shouldResetAllowCache;

  const nextState = didApplyTransition
    ? applyBrowserLocalDayTransition(state, currentBrowserLocalDay, {
        activatePendingBlockedRootRemoval: shouldActivatePendingBlockedRootRemoval,
        activatePendingProtectedSettings: shouldActivatePendingProtectedSettings,
        resetAllowCache: shouldResetAllowCache,
      })
    : {
        ...state,
        lastProcessedBrowserLocalDay: currentBrowserLocalDay,
      };

  return {
    didChange: nextState !== state,
    didApplyTransition,
    state: nextState,
  };
}

export function applyBrowserLocalDayTransition(
  state: ExtensionState,
  currentBrowserLocalDay: string,
  options: {
    activatePendingBlockedRootRemoval?: boolean;
    activatePendingProtectedSettings?: boolean;
    resetAllowCache?: boolean;
  } = {},
): ExtensionState {
  const activatePendingProtectedSettings = options.activatePendingProtectedSettings ?? true;
  const activatePendingBlockedRootRemoval = options.activatePendingBlockedRootRemoval ?? true;
  const resetAllowCache = options.resetAllowCache ?? true;
  const pendingRemovalRoots = new Set(state.blockedRoots.pendingRemoval);

  return {
    ...state,
    currentConfig: activatePendingProtectedSettings
      ? (state.pendingConfig ?? state.currentConfig)
      : state.currentConfig,
    pendingConfig: activatePendingProtectedSettings ? null : state.pendingConfig,
    blockedRoots: {
      active: activatePendingBlockedRootRemoval
        ? state.blockedRoots.active.filter((root) => !pendingRemovalRoots.has(root))
        : state.blockedRoots.active,
      pendingRemoval: activatePendingBlockedRootRemoval ? [] : state.blockedRoots.pendingRemoval,
      pendingRemovalScheduledOnBrowserLocalDay: activatePendingBlockedRootRemoval
        ? null
        : state.blockedRoots.pendingRemovalScheduledOnBrowserLocalDay,
    },
    lastProcessedBrowserLocalDay: currentBrowserLocalDay,
    verification: {
      ...state.verification,
      allowCacheBrowserLocalDay: resetAllowCache
        ? null
        : state.verification.allowCacheBrowserLocalDay,
    },
  };
}
