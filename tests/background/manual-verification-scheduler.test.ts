import { afterEach, describe, expect, it, vi } from "vitest";
import { createManualVerificationScheduler } from "../../src/background/manual-verification-scheduler";

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolvePromise = (_value: T): void => undefined;
  let rejectPromise = (_error: Error): void => undefined;

  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  };
}

describe("manual verification scheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shares the in-flight verification request", async () => {
    const deferredVerification = createDeferred<string>();
    const runVerification = vi.fn(() => deferredVerification.promise);
    const scheduler = createManualVerificationScheduler(runVerification, {
      cooldownMs: 1500,
    });

    const firstRequest = scheduler.request();
    const secondRequest = scheduler.request();

    expect(runVerification).toHaveBeenCalledTimes(1);

    deferredVerification.resolve("verified");

    await expect(firstRequest).resolves.toBe("verified");
    await expect(secondRequest).resolves.toBe("verified");
  });

  it("waits out the shared cooldown before starting another verification", async () => {
    vi.useFakeTimers();

    const runVerification = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("first-result")
      .mockResolvedValueOnce("second-result");
    const scheduler = createManualVerificationScheduler(runVerification, {
      cooldownMs: 1500,
    });

    await expect(scheduler.request()).resolves.toBe("first-result");

    const secondRequest = scheduler.request();

    expect(runVerification).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1499);
    expect(runVerification).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(secondRequest).resolves.toBe("second-result");
    expect(runVerification).toHaveBeenCalledTimes(2);
  });

  it("coalesces repeated requests that arrive during the shared cooldown", async () => {
    vi.useFakeTimers();

    const runVerification = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("first-result")
      .mockResolvedValueOnce("second-result");
    const scheduler = createManualVerificationScheduler(runVerification, {
      cooldownMs: 1500,
    });

    await expect(scheduler.request()).resolves.toBe("first-result");

    const secondRequest = scheduler.request();
    const thirdRequest = scheduler.request();

    await vi.advanceTimersByTimeAsync(1500);

    await expect(secondRequest).resolves.toBe("second-result");
    await expect(thirdRequest).resolves.toBe("second-result");
    expect(runVerification).toHaveBeenCalledTimes(2);
  });
});
