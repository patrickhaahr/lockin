import {
  DEFAULT_HARD_LOCK_WINDOW,
  createEmptyExtensionState,
  createConfiguredState,
  formatHardLockWindow,
  isSetupRequired,
} from "@/shared/state";
import { escapeHtml } from "@/shared/html";
import { ensureExtensionState, writeExtensionState } from "@/shared/storage";
import type { ExtensionState, PopupView } from "@/shared/types";
import "./style.css";

const root = document.querySelector("#app");

if (!(root instanceof HTMLDivElement)) {
  throw new Error("Missing popup root element.");
}

const popupRoot: HTMLDivElement = root;

let extensionState: ExtensionState = createEmptyExtensionState();
let popupView: PopupView = "main";

void initializePopup();

async function initializePopup(): Promise<void> {
  extensionState = await ensureExtensionState();
  renderPopup();
}

function renderPopup(): void {
  if (isSetupRequired(extensionState)) {
    popupView = "main";
    popupRoot.innerHTML = renderSetupView();
    bindSetupView();
    return;
  }

  if (popupView === "settings") {
    popupRoot.innerHTML = renderSettingsView(extensionState);
  } else {
    popupRoot.innerHTML = renderMainView(extensionState);
  }

  bindRegularView();
}

function bindSetupView(): void {
  const form = popupRoot.querySelector('[data-role="setup-form"]');
  const errorMessage = popupRoot.querySelector('[data-role="setup-error"]');

  if (!(form instanceof HTMLFormElement) || !(errorMessage instanceof HTMLParagraphElement)) {
    throw new Error("Missing setup form elements.");
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveInitialSetup(form, errorMessage);
  });
}

async function saveInitialSetup(
  form: HTMLFormElement,
  errorMessage: HTMLParagraphElement,
): Promise<void> {
  const trackedProfile = readFormValue(form, "trackedProfile").trim();
  const hardLockStart = readFormValue(form, "hardLockStart");
  const hardLockEnd = readFormValue(form, "hardLockEnd");

  if (trackedProfile === "" || hardLockStart === "" || hardLockEnd === "") {
    errorMessage.textContent = "Enter a tracked profile and both hard lock times.";
    return;
  }

  const nextState = createConfiguredState({
    trackedProfile,
    hardLockWindow: {
      start: hardLockStart,
      end: hardLockEnd,
    },
  });

  await writeExtensionState(nextState);
  extensionState = nextState;
  popupView = "main";
  renderPopup();
}

function bindRegularView(): void {
  popupRoot.querySelector('[data-action="open-settings"]')?.addEventListener("click", () => {
    popupView = "settings";
    renderPopup();
  });

  popupRoot.querySelector('[data-action="close-settings"]')?.addEventListener("click", () => {
    popupView = "main";
    renderPopup();
  });
}

function renderSetupView(): string {
  return `
    <main class="shell">
      <section class="panel hero-panel">
        <p class="eyebrow">Setup required</p>
        <h1>LockIn</h1>
        <p class="lede">
          Save a tracked profile and hard lock window to switch the popup into its regular status view.
        </p>
      </section>

      <form class="panel form-panel" data-role="setup-form">
        <label class="field">
          <span>Tracked Profile</span>
          <input name="trackedProfile" type="text" autocomplete="off" placeholder="leetcode-username" required />
        </label>

        <div class="time-grid">
          <label class="field">
            <span>Hard Lock Start</span>
            <input name="hardLockStart" type="time" value="${escapeHtml(DEFAULT_HARD_LOCK_WINDOW.start)}" required />
          </label>

          <label class="field">
            <span>Hard Lock End</span>
            <input name="hardLockEnd" type="time" value="${escapeHtml(DEFAULT_HARD_LOCK_WINDOW.end)}" required />
          </label>
        </div>

        <p class="detail">
          Default blocked roots will be saved on first setup so later slices can enforce them.
        </p>
        <p class="error" data-role="setup-error"></p>

        <button class="primary-button" type="submit">Save setup</button>
      </form>
    </main>
  `;
}

function renderMainView(state: ExtensionState): string {
  if (state.currentConfig === null) {
    throw new Error("Regular popup view requires current configuration.");
  }

  return `
    <main class="shell">
      <section class="panel status-panel">
        <div class="row">
          <div>
            <p class="eyebrow">Regular mode</p>
            <h1>Ready for verification</h1>
          </div>
          <button class="ghost-button icon-button" type="button" data-action="open-settings" aria-label="Open settings">
            Settings
          </button>
        </div>

        <p class="lede">
          Slice 1 wires the popup shell and shared state. Verification and blocking land in later slices.
        </p>

        <dl class="summary-list">
          <div>
            <dt>Tracked Profile</dt>
            <dd>${escapeHtml(state.currentConfig.trackedProfile)}</dd>
          </div>
          <div>
            <dt>Hard Lock Window</dt>
            <dd>${escapeHtml(formatHardLockWindow(state.currentConfig.hardLockWindow))}</dd>
          </div>
          <div>
            <dt>Blocked Roots</dt>
            <dd>${state.blockedRoots.active.length}</dd>
          </div>
          <div>
            <dt>Verification Status</dt>
            <dd>${escapeHtml(state.verification.kind)}</dd>
          </div>
        </dl>
      </section>
    </main>
  `;
}

function renderSettingsView(state: ExtensionState): string {
  if (state.currentConfig === null) {
    throw new Error("Settings view requires current configuration.");
  }

  return `
    <main class="shell">
      <section class="panel">
        <div class="row">
          <button class="ghost-button" type="button" data-action="close-settings">Back</button>
          <div>
            <p class="eyebrow">Settings</p>
            <h1>Current vs pending</h1>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2>Active</h2>
        <dl class="summary-list">
          <div>
            <dt>Tracked Profile</dt>
            <dd>${escapeHtml(state.currentConfig.trackedProfile)}</dd>
          </div>
          <div>
            <dt>Hard Lock Window</dt>
            <dd>${escapeHtml(formatHardLockWindow(state.currentConfig.hardLockWindow))}</dd>
          </div>
          <div>
            <dt>Blocked Roots</dt>
            <dd>${renderRoots(state.blockedRoots.active)}</dd>
          </div>
        </dl>
      </section>

      <section class="panel">
        <h2>Pending</h2>
        <dl class="summary-list">
          <div>
            <dt>Protected Settings</dt>
            <dd>${renderPendingProtectedSettings(state)}</dd>
          </div>
          <div>
            <dt>Blocked Root Removals</dt>
            <dd>${renderRoots(state.blockedRoots.pendingRemoval)}</dd>
          </div>
        </dl>
      </section>
    </main>
  `;
}

function renderPendingProtectedSettings(state: ExtensionState): string {
  if (state.pendingConfig === null) {
    return "No pending protected-setting changes.";
  }

  return `${escapeHtml(state.pendingConfig.trackedProfile)} · ${escapeHtml(formatHardLockWindow(state.pendingConfig.hardLockWindow))}`;
}

function renderRoots(roots: string[]): string {
  if (roots.length === 0) {
    return "None";
  }

  return roots.map((rootName) => escapeHtml(rootName)).join(", ");
}

function readFormValue(form: HTMLFormElement, fieldName: string): string {
  const fieldValue = new FormData(form).get(fieldName);
  return typeof fieldValue === "string" ? fieldValue : "";
}
