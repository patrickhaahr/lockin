import { describe, expect, it, vi } from "vitest";
import { reevaluateOpenTabs } from "../../src/background/open-tab-reevaluation";
import { REEVALUATE_BLOCKED_SITE_MESSAGE_TYPE } from "../../src/shared/runtime-messages";
import { createConfiguredState } from "../../src/shared/state";

type TabLike = {
  id?: number;
  url?: string;
};

describe("open-tab reevaluation", () => {
  it("broadcasts reevaluation to http and https tabs and ignores tabs without ids", async () => {
    const state = createConfiguredState({
      trackedProfile: "lockin-user",
      hardLockWindow: {
        start: "23:00",
        end: "09:00",
      },
    });
    const query = vi
      .fn<() => Promise<TabLike[]>>()
      .mockResolvedValue([
        { id: 1, url: "https://x.com/home" },
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
    const previousState = createConfiguredState({
      trackedProfile: "lockin-user",
      hardLockWindow: {
        start: "23:00",
        end: "09:00",
      },
    });
    const nextState = createConfiguredState({
      trackedProfile: "lockin-user",
      hardLockWindow: {
        start: "23:00",
        end: "09:00",
      },
    });
    nextState.blockedRoots.active = ["x.com"];

    const query = vi
      .fn<() => Promise<TabLike[]>>()
      .mockResolvedValue([{ id: 1, url: "https://twitter.com/home" }]);
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
});
