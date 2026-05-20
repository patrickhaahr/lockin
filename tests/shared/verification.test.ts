import { describe, expect, it, vi } from "vitest";
import { createConfiguredState, createEmptyExtensionState } from "../../src/shared/state";
import { getBlockedSiteAccessDecision } from "../../src/shared/blocked-site-policy";
import {
  type VerifyDailySolveGateResponse,
  requestDailySolveGateVerification,
  runDailySolveGateVerification,
} from "../../src/shared/verification";

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
  it("blocks blocked-site loads immediately when setup is still required", () => {
    expect(
      getBlockedSiteAccessDecision(
        createEmptyExtensionState(),
        createLocalDate(2026, 4, 15, 18, 0),
      ),
    ).toEqual({
      kind: "block",
      reason: "setupRequired",
      status: "setupRequired",
    });
  });

  it("blocks blocked-site loads immediately during the hard lock window", () => {
    expect(
      getBlockedSiteAccessDecision(
        createConfiguredTestState(),
        createLocalDate(2026, 4, 16, 7, 30),
      ),
    ).toEqual({
      kind: "block",
      reason: "blockedByHardLock",
      status: "blockedByHardLock",
    });
  });

  it("skips re-verification when today already has an allow cache", () => {
    const state = createConfiguredTestState();
    state.verification = {
      kind: "allowedToday",
      checkedAt: createLocalDate(2026, 4, 15, 12, 30).toISOString(),
      lastAcceptedSolveAt: createLocalDate(2026, 4, 15, 12, 0).toISOString(),
      allowCacheBrowserLocalDay: "2026-05-15",
    };

    expect(getBlockedSiteAccessDecision(state, createLocalDate(2026, 4, 15, 18, 0))).toEqual({
      kind: "allow",
      status: "allowedToday",
    });
  });

  it("blocks blocked-site loads immediately without a current-day allow cache", () => {
    expect(
      getBlockedSiteAccessDecision(
        createConfiguredTestState(),
        createLocalDate(2026, 4, 15, 18, 0),
      ),
    ).toEqual({
      kind: "block",
      reason: "blockedByDailySolveGate",
      status: "blockedByDailySolveGate",
    });
  });

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
      expect.stringContaining("https://leetcode.com/graphql/?"),
      {
        method: "GET",
      },
    );

    const [requestUrl] = fetchImpl.mock.calls[0] as [string, RequestInit | undefined];
    const parsedRequestUrl = new URL(requestUrl);
    const requestQuery = parsedRequestUrl.searchParams.get("query");

    expect(requestQuery).toContain("query verifyDailySolveGate($username: String!, $limit: Int!)");
    expect(requestQuery).toContain("matchedUser(username: $username)");
    expect(requestQuery).toContain("recentAcSubmissionList(username: $username, limit: $limit)");
    expect(parsedRequestUrl.searchParams.get("variables")).toBe(
      JSON.stringify({
        username: "lockin-user",
        limit: 1,
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

  it("falls back to direct verification when the background request rejects", async () => {
    const state = createConfiguredTestState();
    const now = createLocalDate(2026, 4, 15, 18, 0);
    const acceptedSolveAt = createLocalDate(2026, 4, 15, 12, 0);
    const sendMessage = vi
      .fn<
        (message: { type: "lockIn.verifyDailySolveGate" }) => Promise<VerifyDailySolveGateResponse>
      >()
      .mockRejectedValue(
        new Error("Could not establish connection. Receiving end does not exist."),
      );
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        createSuccessfulVerificationResponse([toLeetCodeTimestamp(acceptedSolveAt)]),
      );
    const writeVerification = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const response = await requestDailySolveGateVerification({
      now,
      fetchImpl,
      readState: async () => state,
      sendMessage,
      writeVerification,
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(response).toEqual({
      verification: {
        kind: "allowedToday",
        checkedAt: now.toISOString(),
        lastAcceptedSolveAt: acceptedSolveAt.toISOString(),
        allowCacheBrowserLocalDay: "2026-05-15",
      },
      usedCache: false,
    });
    expect(writeVerification).toHaveBeenCalledWith(response.verification);
  });

  it("uses the background verification result directly when it succeeds", async () => {
    const sendMessageResponse: VerifyDailySolveGateResponse = {
      verification: {
        kind: "allowedToday",
        checkedAt: createLocalDate(2026, 4, 15, 18, 0).toISOString(),
        lastAcceptedSolveAt: createLocalDate(2026, 4, 15, 12, 0).toISOString(),
        allowCacheBrowserLocalDay: "2026-05-15",
      },
      usedCache: true,
    };
    const sendMessage = vi.fn().mockResolvedValue(sendMessageResponse);
    const fetchImpl = vi.fn<typeof fetch>();
    const readState = vi
      .fn<() => Promise<ReturnType<typeof createConfiguredTestState>>>()
      .mockResolvedValue(createConfiguredTestState());
    const writeVerification = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const response = await requestDailySolveGateVerification({
      sendMessage,
      fetchImpl,
      readState,
      writeVerification,
    });

    expect(response).toEqual(sendMessageResponse);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readState).not.toHaveBeenCalled();
    expect(writeVerification).not.toHaveBeenCalled();
  });

  it("falls back to direct verification when the background request returns verification failed", async () => {
    const state = createConfiguredTestState();
    const now = createLocalDate(2026, 4, 15, 18, 0);
    const acceptedSolveAt = createLocalDate(2026, 4, 15, 12, 0);
    const sendMessage = vi.fn().mockResolvedValue({
      verification: {
        kind: "verificationFailed",
        checkedAt: createLocalDate(2026, 4, 15, 17, 59).toISOString(),
        lastAcceptedSolveAt: null,
        allowCacheBrowserLocalDay: null,
      },
      usedCache: false,
    });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        createSuccessfulVerificationResponse([toLeetCodeTimestamp(acceptedSolveAt)]),
      );
    const writeVerification = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const response = await requestDailySolveGateVerification({
      now,
      fetchImpl,
      readState: async () => state,
      sendMessage,
      writeVerification,
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(response.verification.kind).toBe("allowedToday");
    expect(writeVerification).toHaveBeenCalledWith(response.verification);
  });
});
