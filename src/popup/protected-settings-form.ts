import { escapeHtml } from "@/shared/html";
import {
  formatHardLockWindow,
  getProtectedSettingsChangeAvailability,
  PROTECTED_SETTINGS_LOCKED_MESSAGE_PREFIX,
} from "@/shared/state";
import type { ExtensionState, ProtectedSettings } from "@/shared/types";

const PROTECTED_SETTINGS_FORM_DETAIL =
  "Saving here stages protected-setting changes for tomorrow. Active and pending protected settings stay separate until the next browser-local day.";

export function renderProtectedSettingsForm(state: ExtensionState, now: Date = new Date()): string {
  if (state.currentConfig === null) {
    throw new Error("Protected settings form requires current configuration.");
  }

  const protectedSettingsChangeAvailability = getProtectedSettingsChangeAvailability(state, now);
  const protectedSettingsDisabledAttribute = protectedSettingsChangeAvailability.isLocked
    ? "disabled"
    : "";
  const protectedSettingsDetail = protectedSettingsChangeAvailability.isLocked
    ? `${PROTECTED_SETTINGS_LOCKED_MESSAGE_PREFIX}${escapeHtml(protectedSettingsChangeAvailability.nextChangeAvailableOnBrowserLocalDay ?? "")}.`
    : PROTECTED_SETTINGS_FORM_DETAIL;

  return `
    <form class="form-panel protected-settings-form" data-role="protected-settings-form">
      <label class="field">
        <span>Tracked Profile</span>
        <input
          name="trackedProfile"
          type="text"
          autocomplete="off"
          value="${escapeHtml(state.currentConfig.trackedProfile)}"
          placeholder="leetcode-username"
          required
          ${protectedSettingsDisabledAttribute}
        />
      </label>

      <div class="time-grid">
        <label class="field">
          <span>Hard Lock Start</span>
          <input
            name="hardLockStart"
            type="time"
            value="${escapeHtml(state.currentConfig.hardLockWindow.start)}"
            required
            ${protectedSettingsDisabledAttribute}
          />
        </label>

        <label class="field">
          <span>Hard Lock End</span>
          <input
            name="hardLockEnd"
            type="time"
            value="${escapeHtml(state.currentConfig.hardLockWindow.end)}"
            required
            ${protectedSettingsDisabledAttribute}
          />
        </label>
      </div>

      <p class="detail">
        ${protectedSettingsDetail}
      </p>
      <p class="error" data-role="protected-settings-error"></p>
      <button class="primary-button" type="submit" ${protectedSettingsDisabledAttribute}>Save for tomorrow</button>
    </form>
  `;
}

export function renderProtectedSettingsSummary(settings: ProtectedSettings): string {
  return `
    <dl class="summary-list section-list">
      <div>
        <dt>Tracked Profile</dt>
        <dd>${escapeHtml(settings.trackedProfile)}</dd>
      </div>
      <div>
        <dt>Hard Lock Window</dt>
        <dd>${escapeHtml(formatHardLockWindow(settings.hardLockWindow))}</dd>
      </div>
    </dl>
  `;
}
