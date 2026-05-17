import { createBlockPageViewModel, mountBlockPage } from "@/block/view";
import { MANUAL_VERIFICATION_DEBOUNCE_MS } from "@/shared/constants";
import {
  REEVALUATE_BLOCKED_SITE_MESSAGE_TYPE,
  type ReevaluateBlockedSiteRequest,
} from "@/shared/runtime-messages";
import { readExtensionState } from "@/shared/storage";
import { getActiveBlockedRootForHostname } from "@/shared/state";
import type { ExtensionState } from "@/shared/types";
import {
  type BlockedSiteBlockReason,
  getBlockedSiteVerificationDecision,
  requestDailySolveGateVerification,
  type VerifyDailySolveGateResponse,
} from "@/shared/verification";

export type BlockedSiteLoadAction =
  | {
      kind: "allow";
    }
  | {
      kind: "block";
      blockedRoot: string;
      blockedReason: BlockedSiteBlockReason;
      originalDestination: string;
    };

type ReplaceLocation = {
  replace: (url: string) => void;
};

type ReplacePageWindow = {
  location: ReplaceLocation;
  stop: () => void;
};

type ScheduleTimeout = (handler: () => void, delayMs: number) => number;

function scheduleTimeoutWithGlobal(handler: () => void, delayMs: number): number {
  return globalThis.setTimeout(handler, delayMs);
}

export type BlockPageDependencies = {
  now?: () => Date;
  readState?: () => Promise<ExtensionState>;
  requestVerification?: () => Promise<VerifyDailySolveGateResponse>;
  scheduleTimeout?: ScheduleTimeout;
};

export type BlockedSiteEnforcementDependencies = BlockPageDependencies & {
  documentRef?: Document;
  locationHref?: string;
  windowRef?: ReplacePageWindow;
};

export async function enforceBlockedSiteForCurrentLocation(
  dependencies: BlockedSiteEnforcementDependencies = {},
): Promise<void> {
  const readState = dependencies.readState ?? readExtensionState;
  const documentRef = dependencies.documentRef ?? document;
  const now = dependencies.now?.() ?? new Date();
  const state = await readState();
  const locationHref = dependencies.locationHref ?? window.location.href;
  const windowRef = dependencies.windowRef ?? window;
  const action = resolveBlockedSiteLoadAction(state, locationHref, now);

  if (action.kind === "allow") {
    if (documentRef.documentElement.dataset.lockInBlocked === "true") {
      windowRef.location.replace(
        documentRef.documentElement.dataset.lockInOriginalDestination ?? locationHref,
      );
    }

    return;
  }

  await replacePageWithBlockPage(
    action.originalDestination,
    action.blockedRoot,
    action.blockedReason,
    documentRef,
    windowRef,
    dependencies,
  );
}

export function resolveBlockedSiteLoadAction(
  state: ExtensionState,
  locationHref: string,
  now: Date = new Date(),
): BlockedSiteLoadAction {
  const blockedRoot = getBlockedRootForLocation(state, locationHref);

  if (blockedRoot === null) {
    return {
      kind: "allow",
    };
  }

  const decision = getBlockedSiteVerificationDecision(state, now);

  if (decision.kind === "block") {
    return {
      kind: "block",
      blockedRoot,
      blockedReason: decision.reason,
      originalDestination: locationHref,
    };
  }

  return {
    kind: "allow",
  };
}

export function replacePageWithBlockPage(
  originalDestination: string,
  blockedRoot: string,
  blockedReason: BlockedSiteBlockReason,
  documentRef: Document = document,
  windowRef: ReplacePageWindow = window,
  dependencies: BlockPageDependencies = {},
): Promise<void> {
  windowRef.stop();

  const htmlElement = documentRef.documentElement;
  htmlElement.dataset.lockInBlocked = "true";
  htmlElement.dataset.lockInOriginalDestination = originalDestination;
  const head = documentRef.createElement("head");
  const body = documentRef.createElement("body");
  const title = documentRef.createElement("title");
  const viewport = documentRef.createElement("meta");
  const host = documentRef.createElement("div");

  title.textContent = "LockIn Blocked Site";
  viewport.name = "viewport";
  viewport.content = "width=device-width, initial-scale=1";
  host.id = "lockin-block-page";
  host.setAttribute("aria-label", `LockIn blocked ${blockedRoot}`);

  head.replaceChildren(title, viewport);
  body.replaceChildren(host);
  htmlElement.replaceChildren(head, body);

  const shadowRoot = host.attachShadow({ mode: "open" });
  return renderBlockPage(shadowRoot, originalDestination, blockedReason, {
    autoVerify: true,
    dependencies,
    windowRef: windowRef.location,
  });
}

function getBlockedRootForLocation(state: ExtensionState, locationHref: string): string | null {
  try {
    return getActiveBlockedRootForHostname(state.blockedRoots, new URL(locationHref).hostname);
  } catch {
    return null;
  }
}

type BlockPageRenderOptions = {
  autoVerify: boolean;
  dependencies: BlockPageDependencies;
  windowRef: ReplaceLocation;
};

async function renderBlockPage(
  target: ShadowRoot,
  originalDestination: string,
  blockedReason: BlockedSiteBlockReason,
  options: BlockPageRenderOptions,
): Promise<void> {
  const readState = options.dependencies.readState ?? readExtensionState;
  const requestVerification =
    options.dependencies.requestVerification ?? requestDailySolveGateVerification;
  const now = options.dependencies.now ?? (() => new Date());
  const scheduleTimeout = options.dependencies.scheduleTimeout ?? scheduleTimeoutWithGlobal;
  const state = await readState();
  let cooldownUntil = 0;
  let isChecking = false;

  const render = (currentState: ExtensionState, reason: typeof blockedReason): void => {
    const isCooldownActive = now().getTime() < cooldownUntil;
    const isCheckAgainDisabled = isChecking || isCooldownActive;
    const onCheckAgain = isCheckAgainDisabled
      ? undefined
      : () => {
          void verifyAndMaybeRestore();
        };

    mountBlockPage(
      target,
      createBlockPageViewModel(
        currentState,
        reason,
        originalDestination,
        now(),
        isChecking,
        isCheckAgainDisabled,
      ),
      { onCheckAgain },
    );
  };

  const verifyAndMaybeRestore = async (): Promise<void> => {
    if (isChecking) {
      return;
    }

    isChecking = true;
    render(await readState(), blockedReason);

    try {
      const verificationResponse = await requestVerification();
      const latestState = await readState();
      const decision = getBlockedSiteVerificationDecision(latestState, now());

      if (decision.kind === "allow") {
        isChecking = false;
        cooldownUntil = now().getTime() + MANUAL_VERIFICATION_DEBOUNCE_MS;
        options.windowRef.replace(originalDestination);
        return;
      }

      const nextBlockedReason =
        verificationResponse.verification.kind === "setupRequired"
          ? "setupRequired"
          : decision.reason;

      isChecking = false;
      cooldownUntil = now().getTime() + MANUAL_VERIFICATION_DEBOUNCE_MS;
      scheduleCooldownRerender(latestState, nextBlockedReason);

      render(latestState, nextBlockedReason);
    } catch {
      isChecking = false;
      cooldownUntil = now().getTime() + MANUAL_VERIFICATION_DEBOUNCE_MS;

      const latestState = await readState();
      const failureState: ExtensionState = {
        ...latestState,
        verification: {
          ...latestState.verification,
          allowCacheBrowserLocalDay: null,
          checkedAt: now().toISOString(),
          kind: "verificationFailed",
        },
      };
      const failureDecision = getBlockedSiteVerificationDecision(failureState, now());
      const nextBlockedReason =
        failureDecision.kind === "block" ? failureDecision.reason : blockedReason;

      scheduleCooldownRerender(failureState, nextBlockedReason);
      render(failureState, nextBlockedReason);
    }
  };

  const scheduleCooldownRerender = (
    currentState: ExtensionState,
    reason: typeof blockedReason,
  ): void => {
    const delayMs = cooldownUntil - now().getTime();

    if (delayMs <= 0) {
      render(currentState, reason);
      return;
    }

    scheduleTimeout(() => {
      if (!isChecking && now().getTime() >= cooldownUntil) {
        render(currentState, reason);
      }
    }, delayMs);
  };

  render(state, blockedReason);

  if (options.autoVerify) {
    await verifyAndMaybeRestore();
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  chrome.runtime.onMessage.addListener((message) => {
    if (!isReevaluateBlockedSiteRequest(message)) {
      return false;
    }

    void enforceBlockedSiteForCurrentLocation();
    return false;
  });

  void enforceBlockedSiteForCurrentLocation();
}

function isReevaluateBlockedSiteRequest(message: unknown): message is ReevaluateBlockedSiteRequest {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === REEVALUATE_BLOCKED_SITE_MESSAGE_TYPE
  );
}
