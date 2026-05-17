import { getActiveBlockedRootForHostname } from "@/shared/state";
import {
  REEVALUATE_BLOCKED_SITE_MESSAGE_TYPE,
  type ReevaluateBlockedSiteRequest,
} from "@/shared/runtime-messages";
import type { ExtensionState } from "@/shared/types";

type TabsApi = Pick<typeof chrome.tabs, "query" | "reload" | "sendMessage">;

export async function reevaluateOpenTabs(
  state: ExtensionState,
  previousState: ExtensionState | null = null,
  tabsApi: TabsApi = chrome.tabs,
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
        if (shouldReloadTabForReevaluation(state, previousState, tab.url)) {
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
): boolean {
  if (url === undefined) {
    return false;
  }

  try {
    const hostname = new URL(url).hostname;

    return (
      getActiveBlockedRootForHostname(state.blockedRoots, hostname) !== null ||
      (previousState !== null &&
        getActiveBlockedRootForHostname(previousState.blockedRoots, hostname) !== null)
    );
  } catch {
    return false;
  }
}
