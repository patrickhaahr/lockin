import { describe, expect, it, vi } from "vitest";
import { reevaluateOpenTabs } from "../../src/background/open-tab-reevaluation";
import { getBrowserLocalDay } from "../../src/shared/state";
import { REEVALUATE_BLOCKED_SITE_MESSAGE_TYPE } from "../../src/shared/runtime-messages";
import { createConfiguredState } from "../../src/shared/state";

type TabLike = {
  id?: number;
  url?: string;
};

const TEST_BLOCKED_ROOT = "example.com";

function createConfiguredTestState(blockedRoots: string[] = [TEST_BLOCKED_ROOT]) {
  const state = createConfiguredState({
    trackedProfile: "lockin-user",
    hardLockWindow: {
      start: "23:00",
      end: "09:00",
    },
  });

  state.blockedRoots.active = blockedRoots;

  return state;
}

describe("open-tab reevaluation", () => {
  it("broadcasts reevaluation to http and https tabs and ignores tabs without ids", async () => {
    const state = createConfiguredTestState([TEST_BLOCKED_ROOT, "twitter.com"]);
    const query = vi
      .fn<() => Promise<TabLike[]>>()
      .mockResolvedValue([
        { id: 1, url: "https://example.com/home" },
        { id: 2, url: "https://twitter.com/home" },
        { url: "https://leetcode.com/problemset/" },
      ]);
    const sendMessage = vi
      .fn<(tabId: number, message: unknown) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("receiving end does not exist"));
    const reload = vi.fn<(tabId: number) => Promise<void>>().mockResolvedValue(undefined);

    await reevaluateOpenTabs(state, null, {
      query,
      reload,
      sendMessage,
    });

    expect(query).toHaveBeenCalledWith({
      url: ["http://*/*", "https://*/*"],
    });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenNthCalledWith(1, 1, {
      type: REEVALUATE_BLOCKED_SITE_MESSAGE_TYPE,
    });
    expect(sendMessage).toHaveBeenNthCalledWith(2, 2, {
      type: REEVALUATE_BLOCKED_SITE_MESSAGE_TYPE,
    });
    expect(reload).toHaveBeenCalledWith(2);
  });

  it("reloads tabs removed from blocked roots when a reevaluation message cannot be delivered", async () => {
    const previousState = createConfiguredTestState([TEST_BLOCKED_ROOT, "linkedin.com"]);
    const nextState = createConfiguredTestState();

    const query = vi
      .fn<() => Promise<TabLike[]>>()
      .mockResolvedValue([{ id: 1, url: "https://www.linkedin.com/feed/" }]);
    const sendMessage = vi
      .fn<(tabId: number, message: unknown) => Promise<void>>()
      .mockRejectedValue(new Error("receiving end does not exist"));
    const reload = vi.fn<(tabId: number) => Promise<void>>().mockResolvedValue(undefined);

    await reevaluateOpenTabs(nextState, previousState, {
      query,
      reload,
      sendMessage,
    });

    expect(reload).toHaveBeenCalledWith(1);
  });

  it("reloads tabs for newly added blocked roots when access should now be blocked", async () => {
    const previousState = createConfiguredTestState();
    const nextState = createConfiguredTestState();
    nextState.blockedRoots.active = [...nextState.blockedRoots.active, "linkedin.com"];

    const query = vi
      .fn<() => Promise<TabLike[]>>()
      .mockResolvedValue([{ id: 1, url: "https://www.linkedin.com/feed/" }]);
    const sendMessage = vi
      .fn<(tabId: number, message: unknown) => Promise<void>>()
      .mockRejectedValue(new Error("receiving end does not exist"));
    const reload = vi.fn<(tabId: number) => Promise<void>>().mockResolvedValue(undefined);

    await reevaluateOpenTabs(
      nextState,
      previousState,
      {
        query,
        reload,
        sendMessage,
      },
      new Date("2026-05-15T18:00:00"),
      "newlyBlockedRootsOnly",
    );

    expect(reload).toHaveBeenCalledWith(1);
  });

  it("leaves newly added blocked-root tabs untouched when access is currently allowed", async () => {
    const previousState = createConfiguredTestState();
    const nextState = createConfiguredTestState();
    const allowedAt = new Date(2026, 4, 15, 18, 0, 0, 0);

    nextState.blockedRoots.active = [...nextState.blockedRoots.active, "linkedin.com"];
    nextState.verification = {
      kind: "allowedToday",
      checkedAt: allowedAt.toISOString(),
      lastAcceptedSolveAt: allowedAt.toISOString(),
      allowCacheBrowserLocalDay: getBrowserLocalDay(allowedAt),
    };

    const query = vi
      .fn<() => Promise<TabLike[]>>()
      .mockResolvedValue([{ id: 1, url: "https://www.linkedin.com/feed/" }]);
    const sendMessage = vi
      .fn<(tabId: number, message: unknown) => Promise<void>>()
      .mockRejectedValue(new Error("receiving end does not exist"));
    const reload = vi.fn<(tabId: number) => Promise<void>>().mockResolvedValue(undefined);

    await reevaluateOpenTabs(
      nextState,
      previousState,
      {
        query,
        reload,
        sendMessage,
      },
      allowedAt,
      "newlyBlockedRootsOnly",
    );

    expect(reload).not.toHaveBeenCalled();
  });

  it("preserves generic reevaluation reloads when blocked-root tabs become allowed", async () => {
    const state = createConfiguredTestState();
    const allowedAt = new Date(2026, 4, 15, 18, 0, 0, 0);

    state.verification = {
      kind: "allowedToday",
      checkedAt: allowedAt.toISOString(),
      lastAcceptedSolveAt: allowedAt.toISOString(),
      allowCacheBrowserLocalDay: getBrowserLocalDay(allowedAt),
    };

    const query = vi
      .fn<() => Promise<TabLike[]>>()
      .mockResolvedValue([{ id: 1, url: "https://example.com/home" }]);
    const sendMessage = vi
      .fn<(tabId: number, message: unknown) => Promise<void>>()
      .mockRejectedValue(new Error("receiving end does not exist"));
    const reload = vi.fn<(tabId: number) => Promise<void>>().mockResolvedValue(undefined);

    await reevaluateOpenTabs(
      state,
      state,
      {
        query,
        reload,
        sendMessage,
      },
      allowedAt,
    );

    expect(reload).toHaveBeenCalledWith(1);
  });
});
