import { describe, expect, it, vi } from "vitest";
import { createConfiguredState } from "../../src/shared/state";
import { runDailySolveGateVerification } from "../../src/shared/verification";

const ACTIVE_PROTECTED_SETTINGS = {
  trackedProfile: "lockin-user",
  hardLockWindow: {
    start: "23:00",
    end: "09:00",
  },
} as const;

function createConfiguredTestState() {
  return createConfiguredState(ACTIVE_PROTECTED_SETTINGS);
}

function createLocalDate(
  year: number,
  monthIndex: number,
  day: number,
  hours: number,
  minutes: number,
): Date {
  return new Date(year, monthIndex, day, hours, minutes, 0, 0);
}

function toLeetCodeTimestamp(date: Date): string {
  return String(Math.floor(date.getTime() / 1000));
}

function createSuccessfulVerificationResponse(timestamps: string[]): Response {
  return createJsonResponse({
    data: {
      matchedUser: {
        username: "lockin-user",
      },
      recentAcSubmissionList: timestamps.map((timestamp) => ({
        timestamp,
      })),
    },
  });
}

function createJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("daily solve gate verification", () => {
  it("fetches the latest accepted submission from LeetCode GraphQL", async () => {
    const now = createLocalDate(2026, 4, 15, 18, 0);
    const acceptedSolveAt = createLocalDate(2026, 4, 15, 12, 0);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        createSuccessfulVerificationResponse([toLeetCodeTimestamp(acceptedSolveAt)]),
      );

    const result = await runDailySolveGateVerification(createConfiguredTestState(), {
      now,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://leetcode.com/graphql/",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(result.nextState.verification.lastAcceptedSolveAt).toBe(acceptedSolveAt.toISOString());
  });

  it("treats a same-day accepted solve as allowed today", async () => {
    const now = createLocalDate(2026, 4, 15, 18, 0);
    const acceptedSolveAt = createLocalDate(2026, 4, 15, 12, 0);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        createSuccessfulVerificationResponse([toLeetCodeTimestamp(acceptedSolveAt)]),
      );

    const result = await runDailySolveGateVerification(createConfiguredTestState(), {
      now,
      fetchImpl,
    });

    expect(result.usedCache).toBe(false);
    expect(result.nextState.verification).toEqual({
      kind: "allowedToday",
      checkedAt: now.toISOString(),
      lastAcceptedSolveAt: acceptedSolveAt.toISOString(),
      allowCacheBrowserLocalDay: "2026-05-15",
    });
  });

  it("counts repeated accepted solves on already-solved problems for today", async () => {
    const now = createLocalDate(2026, 4, 15, 18, 0);
    const acceptedSolveAt = createLocalDate(2026, 4, 15, 12, 0);
    const priorAcceptedSolveAt = createLocalDate(2026, 4, 14, 12, 0);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        createSuccessfulVerificationResponse([
          toLeetCodeTimestamp(acceptedSolveAt),
          toLeetCodeTimestamp(priorAcceptedSolveAt),
        ]),
      );

    const result = await runDailySolveGateVerification(createConfiguredTestState(), {
      now,
      fetchImpl,
    });

    expect(result.nextState.verification.kind).toBe("allowedToday");
    expect(result.nextState.verification.lastAcceptedSolveAt).toBe(acceptedSolveAt.toISOString());
  });

  it("surfaces invalid usernames as setup required", async () => {
    const now = createLocalDate(2026, 4, 15, 18, 0);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        data: {
          matchedUser: null,
          recentAcSubmissionList: [],
        },
      }),
    );

    const result = await runDailySolveGateVerification(createConfiguredTestState(), {
      now,
      fetchImpl,
    });

    expect(result.nextState.verification).toEqual({
      kind: "setupRequired",
      checkedAt: now.toISOString(),
      lastAcceptedSolveAt: null,
      allowCacheBrowserLocalDay: null,
    });
  });

  it("surfaces LeetCode failures as verification failed", async () => {
    const now = createLocalDate(2026, 4, 15, 18, 0);
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("network down"));

    const result = await runDailySolveGateVerification(createConfiguredTestState(), {
      now,
      fetchImpl,
    });

    expect(result.nextState.verification).toEqual({
      kind: "verificationFailed",
      checkedAt: now.toISOString(),
      lastAcceptedSolveAt: null,
      allowCacheBrowserLocalDay: null,
    });
  });

  it("reuses a successful allow result for the current browser-local day", async () => {
    const now = createLocalDate(2026, 4, 15, 18, 0);
    const acceptedSolveAt = createLocalDate(2026, 4, 15, 12, 0);
    const fetchImpl = vi.fn<typeof fetch>();
    const state = createConfiguredTestState();
    state.verification = {
      kind: "allowedToday",
      checkedAt: createLocalDate(2026, 4, 15, 12, 30).toISOString(),
      lastAcceptedSolveAt: acceptedSolveAt.toISOString(),
      allowCacheBrowserLocalDay: "2026-05-15",
    };

    const result = await runDailySolveGateVerification(state, {
      now,
      fetchImpl,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.usedCache).toBe(true);
    expect(result.nextState.verification).toEqual({
      kind: "allowedToday",
      checkedAt: now.toISOString(),
      lastAcceptedSolveAt: acceptedSolveAt.toISOString(),
      allowCacheBrowserLocalDay: "2026-05-15",
    });
  });

  it("does not cache blocked daily-solve-gate results", async () => {
    const firstNow = createLocalDate(2026, 4, 15, 18, 0);
    const secondNow = createLocalDate(2026, 4, 15, 18, 5);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(createSuccessfulVerificationResponse([]))
      .mockResolvedValueOnce(createSuccessfulVerificationResponse([]));

    const firstResult = await runDailySolveGateVerification(createConfiguredTestState(), {
      now: firstNow,
      fetchImpl,
    });
    const secondResult = await runDailySolveGateVerification(firstResult.nextState, {
      now: secondNow,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(firstResult.nextState.verification.allowCacheBrowserLocalDay).toBeNull();
    expect(secondResult.usedCache).toBe(false);
    expect(secondResult.nextState.verification.kind).toBe("blockedByDailySolveGate");
  });

  it("keeps the allow cache while hard lock still blocks access", async () => {
    const now = createLocalDate(2026, 4, 16, 7, 30);
    const acceptedSolveAt = createLocalDate(2026, 4, 16, 0, 0);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        createSuccessfulVerificationResponse([toLeetCodeTimestamp(acceptedSolveAt)]),
      );

    const result = await runDailySolveGateVerification(createConfiguredTestState(), {
      now,
      fetchImpl,
    });

    expect(result.nextState.verification).toEqual({
      kind: "blockedByHardLock",
      checkedAt: now.toISOString(),
      lastAcceptedSolveAt: acceptedSolveAt.toISOString(),
      allowCacheBrowserLocalDay: "2026-05-16",
    });
  });
});
