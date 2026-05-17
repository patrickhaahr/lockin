import { getActiveBlockedRootForHostname } from "@/shared/state";
import {
  REEVALUATE_BLOCKED_SITE_MESSAGE_TYPE,
  type ReevaluateBlockedSiteRequest,
} from "@/shared/runtime-messages";
import type { ExtensionState } from "@/shared/types";
import { getBlockedSiteVerificationDecision } from "@/shared/verification";

type TabsApi = Pick<typeof chrome.tabs, "query" | "reload" | "sendMessage">;
type FallbackReloadMode = "allBlockedRoots" | "newlyBlockedRootsOnly";

export async function reevaluateOpenTabs(
  state: ExtensionState,
  previousState: ExtensionState | null = null,
  tabsApi: TabsApi = chrome.tabs,
  now: Date = new Date(),
  fallbackReloadMode: FallbackReloadMode = "allBlockedRoots",
): Promise<void> {
  const tabs = await tabsApi.query({
    url: ["http://*/*", "https://*/*"],
  });

  await Promise.allSettled(
    tabs.map(async (tab) => {
      if (tab.id === undefined) {
        return;
      }

      try {
        await tabsApi.sendMessage(tab.id, {
          type: REEVALUATE_BLOCKED_SITE_MESSAGE_TYPE,
        } satisfies ReevaluateBlockedSiteRequest);
      } catch {
        if (
          shouldReloadTabForReevaluation(state, previousState, tab.url, now, fallbackReloadMode)
        ) {
          await tabsApi.reload(tab.id);
        }
      }
    }),
  );
}

function shouldReloadTabForReevaluation(
  state: ExtensionState,
  previousState: ExtensionState | null,
  url: string | undefined,
  now: Date,
  fallbackReloadMode: FallbackReloadMode,
): boolean {
  if (url === undefined) {
    return false;
  }

  try {
    const hostname = new URL(url).hostname;
    const currentBlockedRoot = getActiveBlockedRootForHostname(state.blockedRoots, hostname);
    const previousBlockedRoot =
      previousState === null
        ? null
        : getActiveBlockedRootForHostname(previousState.blockedRoots, hostname);

    if (fallbackReloadMode === "allBlockedRoots") {
      return currentBlockedRoot !== null || previousBlockedRoot !== null;
    }

    return (
      currentBlockedRoot !== null &&
      previousBlockedRoot === null &&
      getBlockedSiteVerificationDecision(state, now).kind === "block"
    );
  } catch {
    return false;
  }
}
