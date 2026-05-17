import { createBlockPageViewModel, mountBlockPage } from "@/block/view";
import { readExtensionState } from "@/shared/storage";
import { getActiveBlockedRootForHostname } from "@/shared/state";
import type { ExtensionState } from "@/shared/types";
import { getBlockedSiteVerificationDecision } from "@/shared/verification";

export type BlockedSiteLoadAction =
  | {
      kind: "allow";
    }
  | {
      kind: "block";
      blockedRoot: string;
      originalDestination: string;
    };

async function runContentScript(): Promise<void> {
  const state = await readExtensionState();
  const action = resolveBlockedSiteLoadAction(state, window.location.href);

  if (action.kind === "allow") {
    return;
  }

  replacePageWithBlockPage(action.originalDestination, action.blockedRoot);
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
  documentRef: Document = document,
  windowRef: Pick<Window, "stop"> = window,
): void {
  if (documentRef.documentElement.dataset.lockInBlocked === "true") {
    return;
  }

  windowRef.stop();

  const htmlElement = documentRef.documentElement;
  htmlElement.dataset.lockInBlocked = "true";
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
  mountBlockPage(shadowRoot, createBlockPageViewModel(originalDestination));
}

function getBlockedRootForLocation(state: ExtensionState, locationHref: string): string | null {
  try {
    return getActiveBlockedRootForHostname(state.blockedRoots, new URL(locationHref).hostname);
  } catch {
    return null;
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  void runContentScript();
}
