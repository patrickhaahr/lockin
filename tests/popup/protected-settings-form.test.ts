import { describe, expect, it } from "vitest";
import { createConfiguredState } from "../../src/shared/state";
import { renderProtectedSettingsForm } from "../../src/popup/protected-settings-form";

const ACTIVE_PROTECTED_SETTINGS = {
  trackedProfile: "lockin-user",
  hardLockWindow: {
    start: "23:00",
    end: "09:00",
  },
} as const;

function createLockedProtectedSettingsState() {
  const state = createConfiguredState(ACTIVE_PROTECTED_SETTINGS);
  state.pendingConfig = {
    trackedProfile: "next-user",
    hardLockWindow: {
      start: "22:00",
      end: "08:00",
    },
  };
  state.protectedSettingsChangeLock.lastChangedOnBrowserLocalDay = "2026-05-16";
  return state;
}

describe("protected settings form rendering", () => {
  it("renders provided draft values instead of the saved protected settings", () => {
    const state = createLockedProtectedSettingsState();
    const renderedForm = renderProtectedSettingsForm(state, {
      values: {
        trackedProfile: "draft-user",
        hardLockStart: "21:30",
        hardLockEnd: "07:15",
      },
      now: new Date("2026-05-17T08:00:00"),
    });

    expect(renderedForm).toContain('value="draft-user"');
    expect(renderedForm).toContain('value="21:30"');
    expect(renderedForm).toContain('value="07:15"');
    expect(renderedForm).not.toContain('value="lockin-user"');
    expect(renderedForm).not.toContain('value="23:00"');
    expect(renderedForm).not.toContain('value="09:00"');
  });

  it("disables protected-settings inputs and submit button while the daily lock is active", () => {
    const state = createLockedProtectedSettingsState();
    const renderedForm = renderProtectedSettingsForm(state, {
      now: new Date("2026-05-16T18:00:00"),
    });

    expect(renderedForm).toContain('name="trackedProfile"');
    expect(renderedForm).toContain('name="hardLockStart"');
    expect(renderedForm).toContain('name="hardLockEnd"');
    expect(renderedForm).toContain('type="submit" disabled');
    expect(renderedForm.match(/required\s+disabled/gu)).toHaveLength(3);
    expect(renderedForm).toContain(
      "Protected settings already changed today. Next change available on 2026-05-17.",
    );
  });

  it("re-enables the protected-settings form after the next browser-local day begins", () => {
    const state = createLockedProtectedSettingsState();
    const renderedForm = renderProtectedSettingsForm(state, {
      now: new Date("2026-05-17T08:00:00"),
    });

    expect(renderedForm).not.toContain('type="submit" disabled');
    expect(renderedForm).not.toMatch(/required\s+disabled/gu);
    expect(renderedForm).toContain("Changes apply next browser-local day.");
  });
});
