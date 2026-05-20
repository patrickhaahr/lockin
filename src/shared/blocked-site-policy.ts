import { getBrowserLocalDay, isSetupRequired, isWithinHardLockWindow } from "./state";
import type { ExtensionState, VerificationStateKind, VerificationStatus } from "./types";

export type BlockedSiteBlockReason =
  | "setupRequired"
  | "blockedByHardLock"
  | "blockedByDailySolveGate";

export type BlockedSiteStatusKind = Exclude<VerificationStateKind, "idle">;

export type BlockedSiteAccessDecision =
  | {
      kind: "allow";
      status: Extract<BlockedSiteStatusKind, "allowedToday">;
    }
  | {
      kind: "block";
      status: Exclude<BlockedSiteStatusKind, "allowedToday">;
      reason: BlockedSiteBlockReason;
    };

export type BlockedSiteBlockedDecision = Extract<BlockedSiteAccessDecision, { kind: "block" }>;

export function getBlockedSiteAccessDecision(
  state: ExtensionState,
  now: Date = new Date(),
): BlockedSiteAccessDecision {
  const status = getBlockedSiteStatusKind(state, now);

  if (status === "allowedToday") {
    return {
      kind: "allow",
      status,
    };
  }

  return {
    kind: "block",
    status,
    reason: getBlockedSiteBlockReasonForStatus(status),
  };
}

export function getBlockedSiteStatusKind(
  state: ExtensionState,
  now: Date = new Date(),
): BlockedSiteStatusKind {
  if (isSetupRequired(state) || state.verification.kind === "setupRequired") {
    return "setupRequired";
  }

  if (
    state.currentConfig !== null &&
    isWithinHardLockWindow(state.currentConfig.hardLockWindow, now)
  ) {
    return "blockedByHardLock";
  }

  if (state.verification.kind === "verificationFailed") {
    return "verificationFailed";
  }

  if (hasAllowCacheForBrowserLocalDay(state.verification, now)) {
    return "allowedToday";
  }

  return "blockedByDailySolveGate";
}

export function getBlockedSiteBlockReasonForStatus(
  status: Exclude<BlockedSiteStatusKind, "allowedToday">,
): BlockedSiteBlockReason {
  switch (status) {
    case "setupRequired":
      return "setupRequired";

    case "blockedByHardLock":
      return "blockedByHardLock";

    case "verificationFailed":
      return "blockedByDailySolveGate";

    default:
      return "blockedByDailySolveGate";
  }
}

export function hasAllowCacheForBrowserLocalDay(
  verification: VerificationStatus,
  now: Date = new Date(),
): boolean {
  const browserLocalDay = getBrowserLocalDay(now);

  return (
    (verification.kind === "allowedToday" || verification.kind === "blockedByHardLock") &&
    verification.allowCacheBrowserLocalDay === browserLocalDay &&
    verification.lastAcceptedSolveAt !== null
  );
}
