import { describe, expect, it, vi } from "vitest";
import { createBlockPageViewModel, mountBlockPage } from "../../src/block/view";
import {
  enforceBlockedSiteForCurrentLocation,
  replacePageWithBlockPage,
  resolveBlockedSiteLoadAction,
} from "../../src/content/main";
import { MANUAL_VERIFICATION_DEBOUNCE_MS } from "../../src/shared/constants";
import { createConfiguredState } from "../../src/shared/state";
import type { VerifyDailySolveGateResponse } from "../../src/shared/verification";

const ACTIVE_PROTECTED_SETTINGS = {
  trackedProfile: "lockin-user",
  hardLockWindow: {
    start: "23:00",
    end: "09:00",
  },
} as const;

const TEST_BLOCKED_ROOT = "example.com";

function createConfiguredTestState(blockedRoots: string[] = [TEST_BLOCKED_ROOT]) {
  const state = createConfiguredState(ACTIVE_PROTECTED_SETTINGS);

  state.blockedRoots.active = blockedRoots;

  return state;
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

class FakeCssStyleSheet {
  public cssText = "";

  replaceSync(value: string): void {
    this.cssText = value;
  }
}

class FakeShadowRoot {
  public readonly ownerDocument: FakeDocument;
  public adoptedStyleSheets: FakeCssStyleSheet[] = [];
  public children: FakeElement[] = [];

  constructor(ownerDocument: FakeDocument) {
    this.ownerDocument = ownerDocument;
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children = children;
  }
}

class FakeElement {
  public readonly ownerDocument: FakeDocument;
  public readonly tagName: string;
  public readonly dataset: Record<string, string> = {};
  public readonly attributes = new Map<string, string>();
  public children: FakeElement[] = [];
  public className = "";
  public disabled = false;
  public id = "";
  public onclick: (() => void) | null = null;
  public textContent = "";
  public shadowRoot: FakeShadowRoot | null = null;

  constructor(ownerDocument: FakeDocument, tagName: string) {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName;
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children = children;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  attachShadow(_options: { mode: "open" | "closed" }): FakeShadowRoot {
    const shadowRoot = new FakeShadowRoot(this.ownerDocument);
    this.shadowRoot = shadowRoot;
    return shadowRoot;
  }

  click(): void {
    if (this.disabled) {
      return;
    }

    this.onclick?.();
  }
}

class FakeDocument {
  public readonly documentElement: FakeElement;

  constructor() {
    this.documentElement = new FakeElement(this, "html");
  }

  createElement(tagName: string): FakeElement {
    return new FakeElement(this, tagName);
  }
}

type TestReplacePageWindow = Parameters<typeof replacePageWithBlockPage>[3];

function useFakeDomGlobals(): () => void {
  const previousHTMLElement = globalThis.HTMLElement;
  const previousShadowRoot = globalThis.ShadowRoot;
  const previousCssStyleSheet = globalThis.CSSStyleSheet;

  globalThis.HTMLElement = FakeElement as unknown as typeof HTMLElement;
  globalThis.ShadowRoot = FakeShadowRoot as unknown as typeof ShadowRoot;
  globalThis.CSSStyleSheet = FakeCssStyleSheet as unknown as typeof CSSStyleSheet;

  return function restore(): void {
    globalThis.HTMLElement = previousHTMLElement;
    globalThis.ShadowRoot = previousShadowRoot;
    globalThis.CSSStyleSheet = previousCssStyleSheet;
  };
}

function getRenderedCheckAgainButton(fakeDocument: FakeDocument): FakeElement | undefined {
  return getRenderedPanel(fakeDocument)?.children[4]?.children[0];
}

function getRenderedPanel(fakeDocument: FakeDocument): FakeElement | undefined {
  return fakeDocument.documentElement.children[1]?.children[0]?.shadowRoot?.children[0]
    ?.children[0];
}

function createTestWindow(overrides: Partial<TestReplacePageWindow> = {}): TestReplacePageWindow {
  return {
    location: {
      replace: vi.fn(),
    },
    stop(): void {},
    ...overrides,
  };
}

describe("content blocked-site enforcement", () => {
  it("blocks active blocked-root subdomains and preserves the original destination", () => {
    expect(
      resolveBlockedSiteLoadAction(
        createConfiguredTestState(),
        "https://mobile.example.com/home?ref=lockin#top",
        createLocalDate(2026, 4, 16, 7, 30),
      ),
    ).toEqual({
      kind: "block",
      blockedRoot: TEST_BLOCKED_ROOT,
      originalDestination: "https://mobile.example.com/home?ref=lockin#top",
    });
  });

  it("leaves non-blocked hostnames untouched", () => {
    expect(
      resolveBlockedSiteLoadAction(createConfiguredTestState(), "https://leetcode.com/problemset/"),
    ).toEqual({
      kind: "allow",
    });
  });

  it("allows access immediately when the current browser-local day already has an allow cache", () => {
    const state = createConfiguredTestState();
    state.verification = {
      kind: "allowedToday",
      checkedAt: "2026-05-15T12:30:00.000Z",
      lastAcceptedSolveAt: "2026-05-15T12:00:00.000Z",
      allowCacheBrowserLocalDay: "2026-05-15",
    };

    expect(
      resolveBlockedSiteLoadAction(
        state,
        "https://example.com/home",
        new Date("2026-05-15T18:00:00"),
      ),
    ).toEqual({
      kind: "allow",
    });
  });

  it("blocks the page immediately when the daily solve gate is not satisfied", () => {
    expect(
      resolveBlockedSiteLoadAction(
        createConfiguredTestState(),
        "https://example.com/home",
        new Date("2026-05-15T18:00:00"),
      ),
    ).toEqual({
      kind: "block",
      blockedRoot: TEST_BLOCKED_ROOT,
      originalDestination: "https://example.com/home",
    });
  });

  it("reevaluates an already-open blocked tab and replaces it with the Block Page", async () => {
    const restoreGlobals = useFakeDomGlobals();
    const fakeDocument = new FakeDocument();
    const state = createConfiguredTestState();
    let stopCalls = 0;

    try {
      await enforceBlockedSiteForCurrentLocation({
        documentRef: fakeDocument as unknown as Document,
        locationHref: "https://mobile.example.com/home",
        now: () => createLocalDate(2026, 4, 16, 7, 30),
        readState: async () => state,
        requestVerification: async () => ({
          usedCache: false,
          verification: state.verification,
        }),
        windowRef: createTestWindow({
          stop(): void {
            stopCalls += 1;
          },
        }),
      });
    } finally {
      restoreGlobals();
    }

    expect(stopCalls).toBe(1);
    expect(fakeDocument.documentElement.dataset.lockInBlocked).toBe("true");
  });

  it("refreshes an already-rendered Block Page when the blocking reason changes", async () => {
    const restoreGlobals = useFakeDomGlobals();
    const fakeDocument = new FakeDocument();
    const hardLockState = createConfiguredTestState();
    hardLockState.verification = {
      kind: "blockedByHardLock",
      checkedAt: createLocalDate(2026, 4, 16, 8, 59).toISOString(),
      lastAcceptedSolveAt: createLocalDate(2026, 4, 15, 21, 45).toISOString(),
      allowCacheBrowserLocalDay: null,
    };

    const dailySolveGateState = createConfiguredTestState();
    dailySolveGateState.verification = {
      kind: "blockedByDailySolveGate",
      checkedAt: createLocalDate(2026, 4, 16, 9, 1).toISOString(),
      lastAcceptedSolveAt: createLocalDate(2026, 4, 15, 21, 45).toISOString(),
      allowCacheBrowserLocalDay: null,
    };

    try {
      await enforceBlockedSiteForCurrentLocation({
        documentRef: fakeDocument as unknown as Document,
        locationHref: "https://example.com/home",
        now: () => createLocalDate(2026, 4, 16, 8, 59),
        readState: async () => hardLockState,
        requestVerification: async () => ({
          usedCache: false,
          verification: hardLockState.verification,
        }),
        windowRef: createTestWindow(),
      });

      await enforceBlockedSiteForCurrentLocation({
        documentRef: fakeDocument as unknown as Document,
        locationHref: "https://example.com/home",
        now: () => createLocalDate(2026, 4, 16, 9, 1),
        readState: async () => dailySolveGateState,
        requestVerification: async () => ({
          usedCache: false,
          verification: dailySolveGateState.verification,
        }),
        windowRef: createTestWindow(),
      });
    } finally {
      restoreGlobals();
    }

    const panel = getRenderedPanel(fakeDocument);
    const detailsList = panel?.children[3];
    const blockedBecauseRow = detailsList?.children[0];

    expect(panel?.children[1]?.textContent).toBe("Blocked by Daily Solve Gate");
    expect(blockedBecauseRow?.children[1]?.textContent).toBe("Daily Solve Gate");
  });

  it("restores the original destination when reevaluation changes a blocked tab to allowed", async () => {
    const restoreGlobals = useFakeDomGlobals();
    const fakeDocument = new FakeDocument();
    const blockedState = createConfiguredTestState();
    const allowedState = createConfiguredTestState();
    allowedState.verification = {
      kind: "allowedToday",
      checkedAt: createLocalDate(2026, 4, 16, 10, 1).toISOString(),
      lastAcceptedSolveAt: createLocalDate(2026, 4, 16, 10, 0).toISOString(),
      allowCacheBrowserLocalDay: "2026-05-16",
    };
    const locationReplace = vi.fn();

    try {
      await enforceBlockedSiteForCurrentLocation({
        documentRef: fakeDocument as unknown as Document,
        locationHref: "https://example.com/home",
        now: () => createLocalDate(2026, 4, 16, 8, 59),
        readState: async () => blockedState,
        requestVerification: async () => ({
          usedCache: false,
          verification: blockedState.verification,
        }),
        windowRef: createTestWindow({
          location: { replace: locationReplace },
        }),
      });

      await enforceBlockedSiteForCurrentLocation({
        documentRef: fakeDocument as unknown as Document,
        locationHref: "https://example.com/home",
        now: () => createLocalDate(2026, 4, 16, 10, 1),
        readState: async () => allowedState,
        requestVerification: async () => ({
          usedCache: false,
          verification: allowedState.verification,
        }),
        windowRef: createTestWindow({
          location: { replace: locationReplace },
        }),
      });
    } finally {
      restoreGlobals();
    }

    expect(locationReplace).toHaveBeenCalledWith("https://example.com/home");
  });

  it("renders a reason-aware block page with the original destination and latest solve details", async () => {
    const restoreGlobals = useFakeDomGlobals();
    const fakeDocument = new FakeDocument();
    let stopCalls = 0;
    const state = createConfiguredTestState(["twitter.com"]);
    state.verification = {
      kind: "blockedByHardLock",
      checkedAt: createLocalDate(2026, 4, 16, 7, 30).toISOString(),
      lastAcceptedSolveAt: createLocalDate(2026, 4, 16, 0, 0).toISOString(),
      allowCacheBrowserLocalDay: "2026-05-16",
    };

    try {
      await replacePageWithBlockPage(
        "https://mobile.twitter.com/home?ref=lockin#top",
        "twitter.com",
        fakeDocument as unknown as Document,
        createTestWindow({
          stop(): void {
            stopCalls += 1;
          },
        }),
        {
          now: () => createLocalDate(2026, 4, 16, 7, 30),
          readState: async () => state,
          requestVerification: async () => ({
            usedCache: true,
            verification: state.verification,
          }),
        },
      );
    } finally {
      restoreGlobals();
    }

    expect(stopCalls).toBe(1);
    expect(fakeDocument.documentElement.dataset.lockInBlocked).toBe("true");
    expect(fakeDocument.documentElement.children).toHaveLength(2);

    const body = fakeDocument.documentElement.children[1];
    const host = body.children[0];

    expect(host.id).toBe("lockin-block-page");
    expect(host.getAttribute("aria-label")).toBe("LockIn blocked twitter.com");
    expect(host.shadowRoot?.children).toHaveLength(1);
    expect(host.shadowRoot?.adoptedStyleSheets[0]?.cssText).toContain("background-image");
    expect(host.shadowRoot?.adoptedStyleSheets[0]?.cssText).not.toContain("@import");

    const panel = getRenderedPanel(fakeDocument);
    const detailsList = panel?.children[3];
    const blockedBecauseRow = detailsList?.children[0];
    const blockedHostnameRow = detailsList?.children[1];
    const originalDestinationRow = detailsList?.children[2];
    const latestSolveRow = detailsList?.children[3];
    const nextUnlockRow = detailsList?.children[4];
    const button = panel?.children[4]?.children[0];

    expect(panel?.children[1]?.textContent).toBe("Blocked by Hard Lock");
    expect(panel?.children[2]?.textContent).toContain("Hard Lock Window");
    expect(blockedBecauseRow?.children[1]?.textContent).toBe("Hard Lock Window");
    expect(blockedHostnameRow?.children[1]?.textContent).toBe("mobile.twitter.com");
    expect(originalDestinationRow?.children[1]?.textContent).toBe(
      "https://mobile.twitter.com/home?ref=lockin#top",
    );
    expect(latestSolveRow?.children[1]?.textContent).toBe("2026-05-16 00:00");
    expect(nextUnlockRow?.children[1]?.textContent).toContain("09:00");
    expect(button?.textContent).toBe("Check again");
    expect(host.shadowRoot?.children[0]?.children[3]?.tagName).toBe("style");
    expect(host.shadowRoot?.children[0]?.children[3]?.textContent).toContain(
      "fonts.googleapis.com",
    );
  });

  it("verifies once on load and restores the original destination when access becomes allowed", async () => {
    const restoreGlobals = useFakeDomGlobals();
    const fakeDocument = new FakeDocument();
    const blockedState = createConfiguredTestState();
    blockedState.verification = {
      kind: "blockedByDailySolveGate",
      checkedAt: createLocalDate(2026, 4, 16, 10, 0).toISOString(),
      lastAcceptedSolveAt: createLocalDate(2026, 4, 15, 21, 45).toISOString(),
      allowCacheBrowserLocalDay: null,
    };

    const allowedState = createConfiguredTestState();
    allowedState.verification = {
      kind: "allowedToday",
      checkedAt: createLocalDate(2026, 4, 16, 10, 1).toISOString(),
      lastAcceptedSolveAt: createLocalDate(2026, 4, 16, 10, 0).toISOString(),
      allowCacheBrowserLocalDay: "2026-05-16",
    };

    const requestVerification = vi.fn(async () => ({
      usedCache: false,
      verification: allowedState.verification,
    }));
    const locationReplace = vi.fn();
    let readCount = 0;

    try {
      await replacePageWithBlockPage(
        "https://example.com/home",
        TEST_BLOCKED_ROOT,
        fakeDocument as unknown as Document,
        createTestWindow({ location: { replace: locationReplace } }),
        {
          now: () => createLocalDate(2026, 4, 16, 10, 1),
          readState: async () => {
            readCount += 1;
            return readCount >= 2 ? allowedState : blockedState;
          },
          requestVerification,
        },
      );
    } finally {
      restoreGlobals();
    }

    expect(requestVerification).toHaveBeenCalledTimes(1);
    expect(locationReplace).toHaveBeenCalledWith("https://example.com/home");
  });

  it("disables Check again while a manual verification is in flight", async () => {
    const restoreGlobals = useFakeDomGlobals();
    const fakeDocument = new FakeDocument();
    const state = createConfiguredTestState();
    state.verification = {
      kind: "blockedByDailySolveGate",
      checkedAt: createLocalDate(2026, 4, 16, 10, 0).toISOString(),
      lastAcceptedSolveAt: createLocalDate(2026, 4, 15, 21, 45).toISOString(),
      allowCacheBrowserLocalDay: null,
    };

    let currentTimeMs = createLocalDate(2026, 4, 16, 10, 1).getTime();
    const scheduledTimeout = createScheduledTimeoutRecorder();
    let resolveVerificationRequest!: (value: VerifyDailySolveGateResponse) => void;
    const requestVerification = vi
      .fn<() => Promise<VerifyDailySolveGateResponse>>()
      .mockResolvedValueOnce({
        usedCache: false,
        verification: state.verification,
      })
      .mockImplementationOnce(() => {
        const deferred = createDeferredVerificationResponse();
        resolveVerificationRequest = deferred.resolve;
        return deferred.promise;
      });

    try {
      await replacePageWithBlockPage(
        "https://example.com/home",
        TEST_BLOCKED_ROOT,
        fakeDocument as unknown as Document,
        createTestWindow(),
        {
          now: () => new Date(currentTimeMs),
          readState: async () => state,
          requestVerification,
          scheduleTimeout: scheduledTimeout.schedule,
        },
      );

      currentTimeMs += MANUAL_VERIFICATION_DEBOUNCE_MS;
      scheduledTimeout.runLatest();

      const firstButton = getRenderedCheckAgainButton(fakeDocument);

      firstButton?.click();

      await Promise.resolve();

      const checkingButton = getRenderedCheckAgainButton(fakeDocument);

      expect(checkingButton?.disabled).toBe(true);
      expect(checkingButton?.textContent).toBe("Checking...");
      expect(requestVerification).toHaveBeenCalledTimes(2);

      resolveVerificationRequest({
        usedCache: false,
        verification: state.verification,
      });

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      restoreGlobals();
    }
  });

  it("keeps Check again disabled until the debounce window expires", async () => {
    const restoreGlobals = useFakeDomGlobals();
    const fakeDocument = new FakeDocument();
    const state = createConfiguredTestState();
    state.verification = {
      kind: "blockedByDailySolveGate",
      checkedAt: createLocalDate(2026, 4, 16, 10, 0).toISOString(),
      lastAcceptedSolveAt: createLocalDate(2026, 4, 15, 21, 45).toISOString(),
      allowCacheBrowserLocalDay: null,
    };

    let currentTimeMs = createLocalDate(2026, 4, 16, 10, 1).getTime();
    const scheduledTimeout = createScheduledTimeoutRecorder();
    const requestVerification = vi
      .fn<() => Promise<VerifyDailySolveGateResponse>>()
      .mockResolvedValue({
        usedCache: false,
        verification: state.verification,
      });

    try {
      await replacePageWithBlockPage(
        "https://example.com/home",
        TEST_BLOCKED_ROOT,
        fakeDocument as unknown as Document,
        createTestWindow(),
        {
          now: () => new Date(currentTimeMs),
          readState: async () => state,
          requestVerification,
          scheduleTimeout: scheduledTimeout.schedule,
        },
      );

      expect(requestVerification).toHaveBeenCalledTimes(1);

      const cooldownButton = getRenderedCheckAgainButton(fakeDocument);

      expect(cooldownButton?.disabled).toBe(true);
      expect(cooldownButton?.textContent).toBe("Check again");

      cooldownButton?.click();
      expect(requestVerification).toHaveBeenCalledTimes(1);

      currentTimeMs += MANUAL_VERIFICATION_DEBOUNCE_MS;
      scheduledTimeout.runLatest();

      const refreshedButton = getRenderedCheckAgainButton(fakeDocument);

      expect(refreshedButton?.disabled).toBe(false);
    } finally {
      restoreGlobals();
    }
  });

  it("keeps Verification failed visible after the debounce window until a real retry", async () => {
    const restoreGlobals = useFakeDomGlobals();
    const fakeDocument = new FakeDocument();
    const state = createConfiguredTestState();
    state.verification = {
      kind: "blockedByDailySolveGate",
      checkedAt: createLocalDate(2026, 4, 16, 10, 0).toISOString(),
      lastAcceptedSolveAt: createLocalDate(2026, 4, 15, 21, 45).toISOString(),
      allowCacheBrowserLocalDay: null,
    };

    let currentTimeMs = createLocalDate(2026, 4, 16, 10, 1).getTime();
    const scheduledTimeout = createScheduledTimeoutRecorder();
    const requestVerification = vi
      .fn<() => Promise<VerifyDailySolveGateResponse>>()
      .mockRejectedValue(new Error("network down"));

    try {
      await replacePageWithBlockPage(
        "https://example.com/home",
        TEST_BLOCKED_ROOT,
        fakeDocument as unknown as Document,
        createTestWindow(),
        {
          now: () => new Date(currentTimeMs),
          readState: async () => state,
          requestVerification,
          scheduleTimeout: scheduledTimeout.schedule,
        },
      );

      const panelAfterFailure = getRenderedPanel(fakeDocument);

      expect(panelAfterFailure?.children[1]?.textContent).toBe("Verification failed");

      currentTimeMs += MANUAL_VERIFICATION_DEBOUNCE_MS;
      scheduledTimeout.runLatest();

      const panelAfterCooldown = getRenderedPanel(fakeDocument);

      expect(panelAfterCooldown?.children[1]?.textContent).toBe("Verification failed");
      expect(panelAfterCooldown?.children[2]?.textContent).toContain("failing closed");
    } finally {
      restoreGlobals();
    }
  });

  it("updates the displayed blocked reason when a failed verification crosses out of Hard Lock", async () => {
    const restoreGlobals = useFakeDomGlobals();
    const fakeDocument = new FakeDocument();
    const state = createConfiguredTestState();
    state.verification = {
      kind: "blockedByDailySolveGate",
      checkedAt: createLocalDate(2026, 4, 15, 22, 50).toISOString(),
      lastAcceptedSolveAt: createLocalDate(2026, 4, 15, 8, 30).toISOString(),
      allowCacheBrowserLocalDay: null,
    };

    let currentTimeMs = createLocalDate(2026, 4, 16, 8, 59).getTime();
    const requestVerification = vi
      .fn<() => Promise<VerifyDailySolveGateResponse>>()
      .mockImplementation(async () => {
        currentTimeMs = createLocalDate(2026, 4, 16, 9, 1).getTime();
        throw new Error("network down");
      });

    try {
      await replacePageWithBlockPage(
        "https://example.com/home",
        TEST_BLOCKED_ROOT,
        fakeDocument as unknown as Document,
        createTestWindow(),
        {
          now: () => new Date(currentTimeMs),
          readState: async () => state,
          requestVerification,
          scheduleTimeout: createScheduledTimeoutRecorder().schedule,
        },
      );

      const panel = getRenderedPanel(fakeDocument);
      const detailsList = panel?.children[3];
      const blockedBecauseRow = detailsList?.children[0];

      expect(panel?.children[1]?.textContent).toBe("Verification failed");
      expect(blockedBecauseRow?.children[1]?.textContent).toBe("Daily Solve Gate");
    } finally {
      restoreGlobals();
    }
  });

  it("updates the displayed blocked reason when a debounce rerender crosses into Hard Lock", async () => {
    const restoreGlobals = useFakeDomGlobals();
    const fakeDocument = new FakeDocument();
    const state = createConfiguredTestState();
    state.verification = {
      kind: "blockedByDailySolveGate",
      checkedAt: createLocalDate(2026, 4, 16, 8, 58).toISOString(),
      lastAcceptedSolveAt: createLocalDate(2026, 4, 15, 21, 45).toISOString(),
      allowCacheBrowserLocalDay: null,
    };

    let currentTimeMs = createLocalDate(2026, 4, 16, 8, 59).getTime();
    const scheduledTimeout = createScheduledTimeoutRecorder();
    const requestVerification = vi
      .fn<() => Promise<VerifyDailySolveGateResponse>>()
      .mockResolvedValue({
        usedCache: false,
        verification: state.verification,
      });

    try {
      await replacePageWithBlockPage(
        "https://example.com/home",
        TEST_BLOCKED_ROOT,
        fakeDocument as unknown as Document,
        createTestWindow(),
        {
          now: () => new Date(currentTimeMs),
          readState: async () => state,
          requestVerification,
          scheduleTimeout: scheduledTimeout.schedule,
        },
      );

      currentTimeMs = createLocalDate(2026, 4, 16, 23, 1).getTime();
      scheduledTimeout.runLatest();

      const panel = getRenderedPanel(fakeDocument);
      const detailsList = panel?.children[3];
      const blockedBecauseRow = detailsList?.children[0];

      expect(panel?.children[1]?.textContent).toBe("Blocked by Hard Lock");
      expect(blockedBecauseRow?.children[1]?.textContent).toBe("Hard Lock Window");
    } finally {
      restoreGlobals();
    }
  });

  it("injects block page component styles when mounting into a normal element", () => {
    const restoreGlobals = useFakeDomGlobals();
    const fakeDocument = new FakeDocument();
    const root = fakeDocument.createElement("div");

    try {
      mountBlockPage(
        root as unknown as HTMLElement,
        createBlockPageViewModel(createConfiguredTestState(), "https://example.com/home"),
      );
    } finally {
      restoreGlobals();
    }

    expect(root.children).toHaveLength(2);
    expect(root.children[0]?.tagName).toBe("style");
    expect(root.children[0]?.textContent).toContain(".panel");
    expect(root.children[0]?.textContent).toContain("fonts.googleapis.com");
    expect(root.children[0]?.textContent).toContain(".page {");
    expect(root.children[0]?.textContent).toContain("transparent 1.6px");
    expect(root.children[0]?.textContent).not.toContain("rgba(229, 57, 53, 0.12)");
    expect(root.children[0]?.textContent).not.toContain(":host {");
    expect(root.children[1]?.className).toBe("page");
    expect(root.children[1]?.children[0]?.className).toBe("panel");
  });
});

function createDeferredVerificationResponse(): {
  promise: Promise<VerifyDailySolveGateResponse>;
  resolve: (resolvedValue: VerifyDailySolveGateResponse) => void;
} {
  let resolvePromise!: (resolvedValue: VerifyDailySolveGateResponse) => void;

  const promise = new Promise<VerifyDailySolveGateResponse>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: resolvePromise,
  };
}

function createScheduledTimeoutRecorder(): {
  schedule: (handler: () => void, delayMs: number) => number;
  runLatest: () => void;
} {
  let latestHandler: (() => void) | null = null;

  return {
    schedule: (handler: () => void, _delayMs: number): number => {
      latestHandler = handler;
      return 1;
    },
    runLatest: (): void => {
      if (latestHandler !== null) {
        latestHandler();
      }
    },
  };
}
