import type {
  BlockedRootsState,
  ExtensionState,
  HardLockWindow,
  ProtectedSettings,
  VerificationStatus,
} from "./types";
import { getDomain } from "tldts";

export type BlockedRootAddResult =
  | { kind: "invalid" }
  | { kind: "duplicate" }
  | { kind: "updated"; state: ExtensionState };

export const DEFAULT_BLOCKED_ROOTS = ["twitter.com", "x.com"] as const;

export const DEFAULT_HARD_LOCK_WINDOW: HardLockWindow = {
  start: "23:00",
  end: "09:00",
};

export function createIdleVerificationStatus(): VerificationStatus {
  return {
    kind: "idle",
    checkedAt: null,
    lastAcceptedSolveAt: null,
  };
}

export function createEmptyExtensionState(): ExtensionState {
  return {
    currentConfig: null,
    pendingConfig: null,
    blockedRoots: {
      active: [],
      pendingRemoval: [],
    },
    verification: createIdleVerificationStatus(),
  };
}

export function createConfiguredState(setupInput: ProtectedSettings): ExtensionState {
  return {
    currentConfig: createProtectedSettings(setupInput),
    pendingConfig: null,
    blockedRoots: {
      active: [...DEFAULT_BLOCKED_ROOTS],
      pendingRemoval: [],
    },
    verification: createIdleVerificationStatus(),
  };
}

export function isSetupRequired(state: ExtensionState): boolean {
  if (state.currentConfig === null) {
    return true;
  }

  return (
    state.currentConfig.trackedProfile.trim() === "" ||
    state.currentConfig.hardLockWindow.start === "" ||
    state.currentConfig.hardLockWindow.end === ""
  );
}

export function formatHardLockWindow(hardLockWindow: HardLockWindow): string {
  if (isFullDayHardLockWindow(hardLockWindow)) {
    return `Full-day lock (${hardLockWindow.start} - ${hardLockWindow.end})`;
  }

  return `${hardLockWindow.start} - ${hardLockWindow.end}`;
}

export function isFullDayHardLockWindow(hardLockWindow: HardLockWindow): boolean {
  return hardLockWindow.start === hardLockWindow.end;
}

export function normalizeExtensionState(value: unknown): ExtensionState {
  if (!isRecord(value)) {
    return createEmptyExtensionState();
  }

  return {
    currentConfig: parseProtectedSettings(value.currentConfig),
    pendingConfig: parseProtectedSettings(value.pendingConfig),
    blockedRoots: parseBlockedRoots(value.blockedRoots),
    verification: parseVerificationStatus(value.verification),
  };
}

export function normalizeBlockedRoot(input: string): string | null {
  const trimmedInput = input.trim().toLowerCase();

  if (trimmedInput === "") {
    return null;
  }

  const candidate = hasScheme(trimmedInput) ? trimmedInput : `https://${trimmedInput}`;

  let hostname = "";

  try {
    hostname = new URL(candidate).hostname;
  } catch {
    return null;
  }

  const domain = getDomain(hostname, {
    allowPrivateDomains: true,
  });

  return domain === null ? null : domain;
}

export function addBlockedRoot(state: ExtensionState, input: string): BlockedRootAddResult {
  const normalizedRoot = normalizeBlockedRoot(input);

  if (normalizedRoot === null) {
    return {
      kind: "invalid",
    };
  }

  if (state.blockedRoots.pendingRemoval.includes(normalizedRoot)) {
    const nextState = cancelBlockedRootRemoval(state, normalizedRoot);

    if (nextState === null) {
      return {
        kind: "duplicate",
      };
    }

    return {
      kind: "updated",
      state: nextState,
    };
  }

  if (state.blockedRoots.active.includes(normalizedRoot)) {
    return {
      kind: "duplicate",
    };
  }

  return {
    kind: "updated",
    state: {
      ...state,
      blockedRoots: {
        active: [...state.blockedRoots.active, normalizedRoot],
        pendingRemoval: [...state.blockedRoots.pendingRemoval],
      },
    },
  };
}

export function scheduleBlockedRootRemoval(
  state: ExtensionState,
  root: string,
): ExtensionState | null {
  if (
    !state.blockedRoots.active.includes(root) ||
    state.blockedRoots.pendingRemoval.includes(root)
  ) {
    return null;
  }

  return {
    ...state,
    blockedRoots: {
      active: [...state.blockedRoots.active],
      pendingRemoval: [...state.blockedRoots.pendingRemoval, root],
    },
  };
}

export function cancelBlockedRootRemoval(
  state: ExtensionState,
  root: string,
): ExtensionState | null {
  if (!state.blockedRoots.pendingRemoval.includes(root)) {
    return null;
  }

  return {
    ...state,
    blockedRoots: {
      active: [...state.blockedRoots.active],
      pendingRemoval: state.blockedRoots.pendingRemoval.filter(
        (blockedRoot) => blockedRoot !== root,
      ),
    },
  };
}

export function savePendingProtectedSettings(
  state: ExtensionState,
  settingsInput: ProtectedSettings,
): ExtensionState | null {
  if (state.currentConfig === null) {
    return createConfiguredState(settingsInput);
  }

  const nextPendingConfig = createProtectedSettings(settingsInput);
  const matchesCurrentConfig = isSameProtectedSettings(state.currentConfig, nextPendingConfig);
  const matchesPendingConfig =
    state.pendingConfig !== null && isSameProtectedSettings(state.pendingConfig, nextPendingConfig);

  if (matchesCurrentConfig || matchesPendingConfig) {
    return null;
  }

  return {
    ...state,
    pendingConfig: nextPendingConfig,
  };
}

export function isBlockedRootConfigured(blockedRoots: BlockedRootsState, root: string): boolean {
  return blockedRoots.active.includes(root) || blockedRoots.pendingRemoval.includes(root);
}

function createProtectedSettings(setupInput: ProtectedSettings): ProtectedSettings {
  return {
    trackedProfile: setupInput.trackedProfile.trim(),
    hardLockWindow: {
      start: setupInput.hardLockWindow.start,
      end: setupInput.hardLockWindow.end,
    },
  };
}

function isSameProtectedSettings(left: ProtectedSettings, right: ProtectedSettings): boolean {
  return (
    left.trackedProfile === right.trackedProfile &&
    left.hardLockWindow.start === right.hardLockWindow.start &&
    left.hardLockWindow.end === right.hardLockWindow.end
  );
}

function hasScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//iu.test(value);
}

function parseProtectedSettings(value: unknown): ProtectedSettings | null {
  if (!isRecord(value)) {
    return null;
  }

  const trackedProfile =
    typeof value.trackedProfile === "string" ? value.trackedProfile.trim() : "";
  const start = readString(value.hardLockWindow, "start");
  const end = readString(value.hardLockWindow, "end");

  if (trackedProfile === "" || start === "" || end === "") {
    return null;
  }

  return {
    trackedProfile,
    hardLockWindow: {
      start,
      end,
    },
  };
}

function parseBlockedRoots(value: unknown): BlockedRootsState {
  if (!isRecord(value)) {
    return {
      active: [],
      pendingRemoval: [],
    };
  }

  return {
    active: parseStringArray(value.active),
    pendingRemoval: parseStringArray(value.pendingRemoval),
  };
}

function parseVerificationStatus(value: unknown): VerificationStatus {
  if (!isRecord(value)) {
    return createIdleVerificationStatus();
  }

  return {
    kind: isVerificationKind(value.kind) ? value.kind : "idle",
    checkedAt: typeof value.checkedAt === "string" ? value.checkedAt : null,
    lastAcceptedSolveAt:
      typeof value.lastAcceptedSolveAt === "string" ? value.lastAcceptedSolveAt : null,
  };
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function isVerificationKind(value: unknown): value is VerificationStatus["kind"] {
  return (
    value === "idle" ||
    value === "setupRequired" ||
    value === "blockedByHardLock" ||
    value === "blockedByDailySolveGate" ||
    value === "allowedToday" ||
    value === "verificationFailed"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown, key: string): string {
  if (!isRecord(value)) {
    return "";
  }

  return typeof value[key] === "string" ? value[key] : "";
}
