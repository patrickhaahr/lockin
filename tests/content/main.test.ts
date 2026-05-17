import { describe, expect, it } from "vitest";
import { replacePageWithBlockPage, resolveBlockedSiteLoadAction } from "../../src/content/main";
import { createConfiguredState } from "../../src/shared/state";

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
  public id = "";
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

function useFakeDomGlobals(): () => void {
  const previousShadowRoot = globalThis.ShadowRoot;
  const previousCssStyleSheet = globalThis.CSSStyleSheet;

  globalThis.ShadowRoot = FakeShadowRoot as unknown as typeof ShadowRoot;
  globalThis.CSSStyleSheet = FakeCssStyleSheet as unknown as typeof CSSStyleSheet;

  return function restore(): void {
    globalThis.ShadowRoot = previousShadowRoot;
    globalThis.CSSStyleSheet = previousCssStyleSheet;
  };
}

describe("content blocked-site enforcement", () => {
  it("blocks active blocked-root subdomains and preserves the original destination", () => {
    expect(
      resolveBlockedSiteLoadAction(
        createConfiguredTestState(),
        "https://mobile.twitter.com/home?ref=lockin#top",
      ),
    ).toEqual({
      kind: "block",
      blockedRoot: "twitter.com",
      originalDestination: "https://mobile.twitter.com/home?ref=lockin#top",
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
      resolveBlockedSiteLoadAction(state, "https://x.com/home", new Date("2026-05-15T18:00:00")),
    ).toEqual({
      kind: "allow",
    });
  });

  it("blocks the page immediately when the daily solve gate is not satisfied", () => {
    expect(
      resolveBlockedSiteLoadAction(
        createConfiguredTestState(),
        "https://x.com/home",
        new Date("2026-05-15T18:00:00"),
      ),
    ).toEqual({
      kind: "block",
      blockedRoot: "x.com",
      originalDestination: "https://x.com/home",
    });
  });

  it("replaces the current document with a rendered block page", () => {
    const restoreGlobals = useFakeDomGlobals();
    const fakeDocument = new FakeDocument();
    let stopCalls = 0;

    try {
      replacePageWithBlockPage(
        "https://mobile.twitter.com/home?ref=lockin#top",
        "twitter.com",
        fakeDocument as unknown as Document,
        {
          stop(): void {
            stopCalls += 1;
          },
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

    const pageShell = host.shadowRoot?.children[0];
    const panel = pageShell?.children[0];
    const detailsList = panel?.children[3];
    const blockedHostnameRow = detailsList?.children[0];
    const originalDestinationRow = detailsList?.children[1];

    expect(panel?.children[1]?.textContent).toBe("Access to this Blocked Site is currently denied");
    expect(blockedHostnameRow?.children[1]?.textContent).toBe("mobile.twitter.com");
    expect(originalDestinationRow?.children[1]?.textContent).toBe(
      "https://mobile.twitter.com/home?ref=lockin#top",
    );
  });
});
