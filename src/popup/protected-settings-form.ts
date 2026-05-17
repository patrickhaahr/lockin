import { escapeHtml } from "@/shared/html";
import {
  formatProtectedSettingsLockedMessage,
  formatHardLockWindow,
  getProtectedSettingsChangeAvailability,
} from "@/shared/state";
import type { ExtensionState, ProtectedSettings } from "@/shared/types";

export type ProtectedSettingsFormValues = {
  trackedProfile: string;
  hardLockStart: string;
  hardLockEnd: string;
};

const PROTECTED_SETTINGS_FORM_DETAIL = "Changes apply next browser-local day.";

type RenderProtectedSettingsFormOptions = {
  values?: ProtectedSettingsFormValues | null;
  now?: Date;
};

export function renderProtectedSettingsForm(
  state: ExtensionState,
  options: RenderProtectedSettingsFormOptions = {},
): string {
  if (state.currentConfig === null) {
    throw new Error("Protected settings form requires current configuration.");
  }

  const protectedSettingsValues = options.values ?? null;
  const now = options.now ?? new Date();
  const protectedSettingsChangeAvailability = getProtectedSettingsChangeAvailability(state, now);
  const values = protectedSettingsValues ?? {
    trackedProfile: state.currentConfig.trackedProfile,
    hardLockStart: state.currentConfig.hardLockWindow.start,
    hardLockEnd: state.currentConfig.hardLockWindow.end,
  };
  const protectedSettingsDisabledAttribute = protectedSettingsChangeAvailability.isLocked
    ? "disabled"
    : "";
  const protectedSettingsDetail = protectedSettingsChangeAvailability.isLocked
    ? escapeHtml(
        formatProtectedSettingsLockedMessage(
          protectedSettingsChangeAvailability.nextChangeAvailableOnBrowserLocalDay ?? "",
        ),
      )
    : PROTECTED_SETTINGS_FORM_DETAIL;

  return `
    <form data-role="protected-settings-form">
      <div class="form-row">
        <label class="form-label" for="protected-tracked-profile">Tracked Profile</label>
        <input
          class="input-brutal"
          id="protected-tracked-profile"
          name="trackedProfile"
          type="text"
          autocomplete="off"
          value="${escapeHtml(values.trackedProfile)}"
          placeholder="leetcode-username"
          required
          ${protectedSettingsDisabledAttribute}
        />
      </div>

      <div class="split-row form-row">
        <div>
          <label class="form-label" for="protected-hard-lock-start">Lock Start</label>
          <input
            class="input-brutal"
            id="protected-hard-lock-start"
            name="hardLockStart"
            type="time"
            value="${escapeHtml(values.hardLockStart)}"
            required
            ${protectedSettingsDisabledAttribute}
          />
        </div>
        <div>
          <label class="form-label" for="protected-hard-lock-end">Lock End</label>
          <input
            class="input-brutal"
            id="protected-hard-lock-end"
            name="hardLockEnd"
            type="time"
            value="${escapeHtml(values.hardLockEnd)}"
            required
            ${protectedSettingsDisabledAttribute}
          />
        </div>
      </div>

      <div class="help-text">
        ${protectedSettingsDetail}
      </div>
      <div class="error-msg" data-role="protected-settings-error"></div>
      
      <div style="margin-top: 16px;">
        <button class="btn-primary" type="submit" ${protectedSettingsDisabledAttribute}>Stage Settings</button>
      </div>
    </form>
  `;
}

export function renderProtectedSettingsSummary(settings: ProtectedSettings): string {
  return `
    <div class="data-grid">
      <div class="data-row">
        <div class="data-label">Profile</div>
        <div class="data-value">${escapeHtml(settings.trackedProfile)}</div>
      </div>
      <div class="data-row">
        <div class="data-label">Lock Window</div>
        <div class="data-value">${escapeHtml(formatHardLockWindow(settings.hardLockWindow))}</div>
      </div>
    </div>
  `;
}
