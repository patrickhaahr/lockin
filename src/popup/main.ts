import {
  DEFAULT_HARD_LOCK_WINDOW,
  addBlockedRoot,
  cancelBlockedRootRemoval,
  createEmptyExtensionState,
  createConfiguredState,
  formatHardLockWindow,
  isSetupRequired,
  savePendingProtectedSettings,
  scheduleBlockedRootRemoval,
} from "@/shared/state";
import { escapeHtml } from "@/shared/html";
import {
  createStateMutationQueue,
  ensureExtensionState,
  type StateMutationHandler,
  writeExtensionState,
} from "@/shared/storage";
import type { ExtensionState, PopupView, ProtectedSettings } from "@/shared/types";
import "./style.css";

const root = document.querySelector("#app");

if (!(root instanceof HTMLDivElement)) {
  throw new Error("Missing popup root element.");
}

const popupRoot: HTMLDivElement = root;
const BLOCKED_ROOTS_SAVE_ERROR = "Couldn't save blocked-root changes. Try again.";
const PROTECTED_SETTINGS_REQUIRED_ERROR = "Enter a tracked profile and both hard lock times.";
const PROTECTED_SETTINGS_SAVE_ERROR = "Couldn't save protected settings. Try again.";
const SETUP_SAVE_ERROR = "Couldn't save setup. Try again.";

let extensionState: ExtensionState = createEmptyExtensionState();
let popupView: PopupView = "main";
let extensionStateMutations = createStateMutationQueue(extensionState, writeExtensionState);

void initializePopup();

async function initializePopup(): Promise<void> {
  extensionState = await ensureExtensionState();
  extensionStateMutations = createStateMutationQueue(extensionState, writeExtensionState);
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
  const settingsInput = readProtectedSettingsForm(form);

  if (settingsInput === null) {
    errorMessage.textContent = PROTECTED_SETTINGS_REQUIRED_ERROR;
    return;
  }

  const nextState = createConfiguredState(settingsInput);

  popupView = "main";

  try {
    await runStateMutation(() => ({
      nextState,
      result: undefined,
    }));
  } catch {
    errorMessage.textContent = SETUP_SAVE_ERROR;
  }
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

  const blockedRootsForm = popupRoot.querySelector('[data-role="blocked-roots-form"]');
  const blockedRootsError = popupRoot.querySelector('[data-role="blocked-roots-error"]');
  const protectedSettingsForm = popupRoot.querySelector('[data-role="protected-settings-form"]');
  const protectedSettingsError = popupRoot.querySelector('[data-role="protected-settings-error"]');

  if (
    protectedSettingsForm instanceof HTMLFormElement &&
    protectedSettingsError instanceof HTMLParagraphElement
  ) {
    protectedSettingsForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void saveProtectedSettings(protectedSettingsForm, protectedSettingsError);
    });
  }

  if (
    blockedRootsForm instanceof HTMLFormElement &&
    blockedRootsError instanceof HTMLParagraphElement
  ) {
    blockedRootsForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void saveBlockedRoot(blockedRootsForm, blockedRootsError);
    });
  }

  bindRootButtons("schedule-root-removal", scheduleRootRemoval);
  bindRootButtons("cancel-root-removal", cancelRootRemoval);
}

async function saveProtectedSettings(
  form: HTMLFormElement,
  errorMessage: HTMLParagraphElement,
): Promise<void> {
  const settingsInput = readProtectedSettingsForm(form);

  if (settingsInput === null) {
    errorMessage.textContent = PROTECTED_SETTINGS_REQUIRED_ERROR;
    return;
  }

  let saveWasUpdated = false;

  try {
    saveWasUpdated = await runStateMutation((state) => {
      const nextState = savePendingProtectedSettings(state, settingsInput);

      return {
        nextState,
        result: nextState !== null,
      };
    });
  } catch {
    errorMessage.textContent = PROTECTED_SETTINGS_SAVE_ERROR;
    return;
  }

  if (!saveWasUpdated) {
    errorMessage.textContent = "Protected settings already match the active values.";
    return;
  }

  errorMessage.textContent = "";
}

async function saveBlockedRoot(
  form: HTMLFormElement,
  errorMessage: HTMLParagraphElement,
): Promise<void> {
  const blockedRootInput = readFormValue(form, "blockedRoot");

  let result: ReturnType<typeof addBlockedRoot>;

  try {
    result = await runStateMutation((state) => {
      const mutationResult = addBlockedRoot(state, blockedRootInput);

      return {
        nextState: mutationResult.kind === "updated" ? mutationResult.state : null,
        result: mutationResult,
      };
    });
  } catch {
    errorMessage.textContent = BLOCKED_ROOTS_SAVE_ERROR;
    return;
  }

  if (result.kind === "invalid") {
    errorMessage.textContent = "Enter a valid domain root or URL.";
    return;
  }

  if (result.kind === "duplicate") {
    errorMessage.textContent = "That blocked root is already active or already pending removal.";
    return;
  }

  errorMessage.textContent = "";
  form.reset();
}

async function scheduleRootRemoval(root: string): Promise<void> {
  try {
    await runStateMutation((state) => ({
      nextState: scheduleBlockedRootRemoval(state, root),
      result: undefined,
    }));
  } catch {
    setBlockedRootsError(BLOCKED_ROOTS_SAVE_ERROR);
  }
}

async function cancelRootRemoval(root: string): Promise<void> {
  try {
    await runStateMutation((state) => ({
      nextState: cancelBlockedRootRemoval(state, root),
      result: undefined,
    }));
  } catch {
    setBlockedRootsError(BLOCKED_ROOTS_SAVE_ERROR);
  }
}

async function runStateMutation<TResult>(
  mutateState: StateMutationHandler<ExtensionState, TResult>,
): Promise<TResult> {
  const result = await extensionStateMutations.run(mutateState);
  const nextState = extensionStateMutations.getState();

  if (nextState !== extensionState) {
    extensionState = nextState;
    renderPopup();
  }

  return result;
}

function bindRootButtons(
  action: "schedule-root-removal" | "cancel-root-removal",
  handler: (root: string) => Promise<void>,
): void {
  popupRoot.querySelectorAll<HTMLElement>(`[data-action="${action}"]`).forEach((button) => {
    button.addEventListener("click", () => {
      void handler(button.dataset.root ?? "");
    });
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
          Protected settings and blocked roots are saved from the popup. Verification and blocking land in later slices.
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
        <p class="section-label">Protected Settings</p>
        ${renderProtectedSettingsSummary(state.currentConfig)}

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
              />
            </label>

            <label class="field">
              <span>Hard Lock End</span>
              <input
                name="hardLockEnd"
                type="time"
                value="${escapeHtml(state.currentConfig.hardLockWindow.end)}"
                required
              />
            </label>
          </div>

          <p class="detail">
            Saving here stages protected-setting changes for tomorrow. Active and pending protected settings stay separate until the next browser-local day.
          </p>
          <p class="error" data-role="protected-settings-error"></p>
          <button class="primary-button" type="submit">Save for tomorrow</button>
        </form>

        <p class="section-label">Blocked Roots</p>
        <dl class="summary-list section-list">
          <div>
            <dt>Blocked Roots</dt>
            <dd>${renderActiveBlockedRoots(state.blockedRoots.active, state.blockedRoots.pendingRemoval)}</dd>
          </div>
        </dl>

        <form class="form-panel blocked-roots-form" data-role="blocked-roots-form">
          <label class="field">
            <span>Add blocked root</span>
            <input
              name="blockedRoot"
              type="text"
              autocomplete="off"
              placeholder="youtube.com or https://www.youtube.com"
              required
            />
          </label>
          <p class="detail">
            Adds take effect immediately. Re-adding a root pending removal cancels that pending removal.
          </p>
          <p class="error" data-role="blocked-roots-error"></p>
          <button class="primary-button" type="submit">Add blocked root</button>
        </form>
      </section>

      <section class="panel">
        <h2>Pending</h2>
        <p class="section-label">Protected Settings</p>
        ${renderPendingProtectedSettings(state)}

        <p class="section-label">Blocked Root Removals</p>
        <dl class="summary-list section-list">
          <div>
            <dt>Blocked Root Removals</dt>
            <dd>${renderPendingBlockedRoots(state.blockedRoots.pendingRemoval)}</dd>
          </div>
        </dl>
      </section>
    </main>
  `;
}

function renderPendingProtectedSettings(state: ExtensionState): string {
  if (state.pendingConfig === null) {
    return '<p class="detail empty-state">No pending protected-setting changes.</p>';
  }

  return renderProtectedSettingsSummary(state.pendingConfig);
}

function renderProtectedSettingsSummary(settings: ProtectedSettings): string {
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

function renderActiveBlockedRoots(activeRoots: string[], pendingRemovalRoots: string[]): string {
  if (activeRoots.length === 0) {
    return "None";
  }

  return activeRoots
    .map((rootName) => {
      const isPendingRemoval = pendingRemovalRoots.includes(rootName);
      const removalStatus = isPendingRemoval
        ? '<span class="list-detail">Pending removal tomorrow</span>'
        : "";
      const buttonLabel = isPendingRemoval ? "Removal scheduled" : "Remove tomorrow";
      const disabledAttribute = isPendingRemoval ? "disabled" : "";

      return `
        <span class="list-row">
          <span>
            <span>${escapeHtml(rootName)}</span>
            ${removalStatus}
          </span>
          <button
            class="ghost-button list-button"
            type="button"
            data-action="schedule-root-removal"
            data-root="${escapeHtml(rootName)}"
            ${disabledAttribute}
          >
            ${buttonLabel}
          </button>
        </span>
      `;
    })
    .join("");
}

function renderPendingBlockedRoots(roots: string[]): string {
  if (roots.length === 0) {
    return "None";
  }

  return roots
    .map(
      (rootName) => `
        <span class="list-row">
          <span>${escapeHtml(rootName)}</span>
          <button
            class="ghost-button list-button"
            type="button"
            data-action="cancel-root-removal"
            data-root="${escapeHtml(rootName)}"
          >
            Keep active
          </button>
        </span>
      `,
    )
    .join("");
}

function readFormValue(form: HTMLFormElement, fieldName: string): string {
  const fieldValue = new FormData(form).get(fieldName);
  return typeof fieldValue === "string" ? fieldValue : "";
}

function readProtectedSettingsForm(form: HTMLFormElement): ProtectedSettings | null {
  const trackedProfile = readFormValue(form, "trackedProfile").trim();
  const hardLockStart = readFormValue(form, "hardLockStart");
  const hardLockEnd = readFormValue(form, "hardLockEnd");

  if (trackedProfile === "" || hardLockStart === "" || hardLockEnd === "") {
    return null;
  }

  return {
    trackedProfile,
    hardLockWindow: {
      start: hardLockStart,
      end: hardLockEnd,
    },
  };
}

function setBlockedRootsError(message: string): void {
  const blockedRootsError = popupRoot.querySelector('[data-role="blocked-roots-error"]');

  if (blockedRootsError instanceof HTMLParagraphElement) {
    blockedRootsError.textContent = message;
  }
}
