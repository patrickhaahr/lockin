import { describe, expect, it } from "vitest";
import { createStateMutationQueue } from "../../src/shared/storage";

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
});
