export type HardLockWindow = {
  start: string;
  end: string;
};

export type ProtectedSettings = {
  trackedProfile: string;
  hardLockWindow: HardLockWindow;
};

export type BlockedRootsState = {
  active: string[];
  pendingRemoval: string[];
};

export type VerificationStateKind =
  | "idle"
  | "setupRequired"
  | "blockedByHardLock"
  | "blockedByDailySolveGate"
  | "allowedToday"
  | "verificationFailed";

export type VerificationStatus = {
  kind: VerificationStateKind;
  checkedAt: string | null;
  lastAcceptedSolveAt: string | null;
};

export type ExtensionState = {
  currentConfig: ProtectedSettings | null;
  pendingConfig: ProtectedSettings | null;
  blockedRoots: BlockedRootsState;
  verification: VerificationStatus;
};

export type PopupView = "main" | "settings";
