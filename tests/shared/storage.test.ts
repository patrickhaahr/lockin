import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createStateMutationQueue,
  readExtensionState,
  writeExtensionState,
  writeVerificationStatus,
} from "../../src/shared/storage";
import { createConfiguredState } from "../../src/shared/state";

function createDeferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
} {
  let resolvePromise = (): void => undefined;
  let rejectPromise = (_error: Error): void => undefined;

  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  };
}

describe("state mutation queue", () => {
  it("applies queued mutations against the latest committed state", async () => {
    const writes: string[][] = [];
    const firstWrite = createDeferred();
    const secondWrite = createDeferred();
    const pendingWrites = [firstWrite, secondWrite];
    const queue = createStateMutationQueue<string[]>([], async (state) => {
      writes.push([...state]);
      const nextWrite = pendingWrites.shift();

      if (nextWrite === undefined) {
        throw new Error("Expected another pending write.");
      }

      await nextWrite.promise;
    });

    const firstMutation = queue.run((currentState) => ({
      nextState: [...currentState, "youtube.com"],
      result: undefined,
    }));
    const secondMutation = queue.run((currentState) => ({
      nextState: [...currentState, "reddit.com"],
      result: undefined,
    }));

    firstWrite.resolve();
    await firstMutation;
    expect(queue.getState()).toEqual(["youtube.com"]);

    secondWrite.resolve();
    await secondMutation;

    expect(writes).toEqual([["youtube.com"], ["youtube.com", "reddit.com"]]);
    expect(queue.getState()).toEqual(["youtube.com", "reddit.com"]);
  });

  it("continues processing later mutations after a failed write", async () => {
    let writeAttempts = 0;
    const queue = createStateMutationQueue(0, async (state) => {
      writeAttempts += 1;

      if (writeAttempts === 1) {
        throw new Error("write failed");
      }

      expect(state).toBe(1);
    });

    await expect(
      queue.run((currentState) => ({
        nextState: currentState + 1,
        result: undefined,
      })),
    ).rejects.toThrow("write failed");

    await expect(
      queue.run((currentState) => ({
        nextState: currentState + 1,
        result: undefined,
      })),
    ).resolves.toBeUndefined();

    expect(writeAttempts).toBe(2);
    expect(queue.getState()).toBe(1);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves separately persisted verification status across later state writes", async () => {
    const storedItems: Record<string, unknown> = {};
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          async get(keys: string | string[]) {
            if (Array.isArray(keys)) {
              return Object.fromEntries(keys.map((key) => [key, storedItems[key]]));
            }

            return {
              [keys]: storedItems[keys],
            };
          },
          async set(values: Record<string, unknown>) {
            Object.assign(storedItems, values);
          },
        },
      },
    });

    const state = createConfiguredState({
      trackedProfile: "lockin-user",
      hardLockWindow: {
        start: "23:00",
        end: "09:00",
      },
    });

    await writeExtensionState(state);
    await writeVerificationStatus({
      kind: "allowedToday",
      checkedAt: "2026-05-16T08:35:00.000Z",
      lastAcceptedSolveAt: "2026-05-16T08:30:00.000Z",
      allowCacheBrowserLocalDay: "2026-05-16",
    });

    await writeExtensionState({
      ...state,
      blockedRoots: {
        active: [...state.blockedRoots.active, "youtube.com"],
        pendingRemoval: [],
        pendingRemovalScheduledOnBrowserLocalDay: null,
      },
      verification: {
        kind: "idle",
        checkedAt: null,
        lastAcceptedSolveAt: null,
        allowCacheBrowserLocalDay: null,
      },
    });

    const persistedState = await readExtensionState();

    expect(persistedState.blockedRoots.active).toContain("youtube.com");
    expect(persistedState.verification).toEqual({
      kind: "allowedToday",
      checkedAt: "2026-05-16T08:35:00.000Z",
      lastAcceptedSolveAt: "2026-05-16T08:30:00.000Z",
      allowCacheBrowserLocalDay: "2026-05-16",
    });
  });
});
