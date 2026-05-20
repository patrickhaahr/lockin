import { clockTimeToMinutes, getBrowserLocalDay, isFullDayHardLockWindow } from "./state";
import {
  getBlockedSiteStatusKind,
  hasAllowCacheForBrowserLocalDay,
  type BlockedSiteBlockReason,
  type BlockedSiteStatusKind,
} from "./blocked-site-policy";
import type { ExtensionState } from "./types";

export type BlockedSiteStatusViewModel = {
  kind: BlockedSiteStatusKind;
  title: string;
  summary: string;
  nextRelevantLabel: string;
  nextRelevantValue: string;
  lastAcceptedSolveValue: string | null;
};

export function getBlockedSiteStatusViewModel(
  state: ExtensionState,
  now: Date = new Date(),
): BlockedSiteStatusViewModel {
  const kind = getBlockedSiteStatusKind(state, now);
  const lastAcceptedSolveValue = formatAcceptedSolveTimestamp(
    state.verification.lastAcceptedSolveAt,
  );
  const isConfigMissing = state.currentConfig === null;

  switch (kind) {
    case "setupRequired":
      return {
        kind,
        title: "Setup required",
        summary: isConfigMissing
          ? "Save a Tracked Profile and Hard Lock Window to switch into the regular popup status view."
          : "LockIn could not verify the saved Tracked Profile. Update settings, then check again.",
        nextRelevantLabel: "Next step",
        nextRelevantValue: isConfigMissing
          ? "Save setup to start checking the Daily Solve Gate."
          : "Update the Tracked Profile in settings.",
        lastAcceptedSolveValue,
      };

    case "blockedByHardLock":
      return {
        kind,
        title: "Blocked by Hard Lock",
        summary:
          "Blocked Sites stay blocked during the Hard Lock Window regardless of Daily Solve Gate status.",
        nextRelevantLabel: "Next unlock",
        nextRelevantValue: getHardLockUnlockMessage(state, now),
        lastAcceptedSolveValue,
      };

    case "blockedByDailySolveGate":
      return {
        kind,
        title: "Blocked by Daily Solve Gate",
        summary:
          "Outside the Hard Lock Window, Blocked Sites stay blocked until this Browser-Local Day has an Accepted Solve.",
        nextRelevantLabel: "Next unlock",
        nextRelevantValue:
          "Complete an Accepted Solve for this Browser-Local Day, then check again.",
        lastAcceptedSolveValue,
      };

    case "allowedToday":
      return {
        kind,
        title: "Allowed Today",
        summary: "The Daily Solve Gate is satisfied for the current Browser-Local Day.",
        nextRelevantLabel: "Next block",
        nextRelevantValue: getNextHardLockMessage(state, now),
        lastAcceptedSolveValue,
      };

    case "verificationFailed":
      return {
        kind,
        title: "Verification failed",
        summary:
          "LockIn could not verify LeetCode and is failing closed outside the Hard Lock Window.",
        nextRelevantLabel: "Next step",
        nextRelevantValue: "Use Check now to retry LeetCode verification.",
        lastAcceptedSolveValue,
      };
  }
}

export function getBlockedReasonLabel(reason: BlockedSiteBlockReason): string {
  switch (reason) {
    case "blockedByHardLock":
      return "Hard Lock Window";

    case "setupRequired":
      return "Setup required";

    default:
      return "Daily Solve Gate";
  }
}

export function formatAcceptedSolveTimestamp(lastAcceptedSolveAt: string | null): string | null {
  if (lastAcceptedSolveAt === null) {
    return null;
  }

  const parsedTimestamp = new Date(lastAcceptedSolveAt);

  if (Number.isNaN(parsedTimestamp.getTime())) {
    return lastAcceptedSolveAt;
  }

  return `${getBrowserLocalDay(parsedTimestamp)} ${String(parsedTimestamp.getHours()).padStart(2, "0")}:${String(parsedTimestamp.getMinutes()).padStart(2, "0")}`;
}

function getHardLockUnlockMessage(state: ExtensionState, now: Date): string {
  if (state.currentConfig === null) {
    return "The Hard Lock Window must be configured before access can be reevaluated.";
  }

  if (isFullDayHardLockWindow(state.currentConfig.hardLockWindow)) {
    return "This Hard Lock Window covers the full browser-local day. Access stays blocked until the setting changes on a future day.";
  }

  const hardLockEndsAt = state.currentConfig.hardLockWindow.end;

  if (hasAllowCacheForBrowserLocalDay(state.verification, now)) {
    return `The Hard Lock Window ends at ${hardLockEndsAt}.`;
  }

  return `The Hard Lock Window ends at ${hardLockEndsAt}, and an Accepted Solve is still required for this Browser-Local Day.`;
}

function getNextHardLockMessage(state: ExtensionState, now: Date): string {
  if (state.currentConfig === null) {
    return "The next block depends on the saved Hard Lock Window.";
  }

  if (isFullDayHardLockWindow(state.currentConfig.hardLockWindow)) {
    return "The current Hard Lock Window covers the full browser-local day.";
  }

  const hardLockStartsAt = state.currentConfig.hardLockWindow.start;
  const nextHardLockBrowserLocalDay = getNextHardLockBrowserLocalDay(
    state.currentConfig.hardLockWindow.start,
    now,
  );

  if (nextHardLockBrowserLocalDay === getBrowserLocalDay(now)) {
    return `The next Hard Lock Window starts at ${hardLockStartsAt}.`;
  }

  return `The next Hard Lock Window starts on ${nextHardLockBrowserLocalDay} at ${hardLockStartsAt}.`;
}

function getNextHardLockBrowserLocalDay(hardLockStart: string, now: Date): string {
  const startMinutes = clockTimeToMinutes(hardLockStart);

  if (startMinutes === null) {
    return getBrowserLocalDay(now);
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  if (currentMinutes < startMinutes) {
    return getBrowserLocalDay(now);
  }

  return getBrowserLocalDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
}
