import {
  DEFAULT_HARD_LOCK_WINDOW,
  addBlockedRoot,
  cancelBlockedRootRemoval,
  createEmptyExtensionState,
  createConfiguredState,
  formatProtectedSettingsLockedMessage,
  formatHardLockWindow,
  isSetupRequired,
  savePendingProtectedSettings,
  scheduleBlockedRootRemoval,
} from "@/shared/state";
import { escapeHtml } from "@/shared/html";
import { MANUAL_VERIFICATION_DEBOUNCE_MS } from "@/shared/constants";
import { requestDailySolveGateVerification } from "@/shared/verification";
import {
  renderProtectedSettingsForm,
  renderProtectedSettingsSummary,
  type ProtectedSettingsFormValues,
} from "./protected-settings-form";
import {
  createStateMutationQueue,
  ensureExtensionState,
  type StateMutationHandler,
  writeVerificationStatus,
  writeExtensionState,
} from "@/shared/storage";
import type { ExtensionState, PopupView, ProtectedSettings } from "@/shared/types";
import { getPopupStatusViewModel } from "./status";
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
const POST_SETUP_VERIFICATION_ERROR =
  "Setup was saved, but the immediate verification could not be completed. Try Check now.";

let popupSettingsTab: "general" | "blocklist" = "general";
let draftProtectedSettings: ProtectedSettingsFormValues | null = null;
let draftBlockedRoot = "";
let extensionState: ExtensionState = createEmptyExtensionState();
let popupView: PopupView = "main";
let extensionStateMutations = createStateMutationQueue(extensionState, writeExtensionState);
let popupVerificationPromise: Promise<void> | null = null;
let popupVerificationCooldownUntil = 0;
let popupVerificationCooldownTimer: number | null = null;
let regularViewErrorMessage = "";

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

  if (!(form instanceof HTMLFormElement) || !(errorMessage instanceof HTMLElement)) {
    throw new Error("Missing setup form elements.");
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveInitialSetup(form, errorMessage);
  });
}

async function saveInitialSetup(form: HTMLFormElement, errorMessage: HTMLElement): Promise<void> {
  const settingsInput = readProtectedSettingsForm(form);

  if (settingsInput === null) {
    errorMessage.textContent = PROTECTED_SETTINGS_REQUIRED_ERROR;
    return;
  }

  const nextState = createConfiguredState(settingsInput);

  popupView = "main";

  try {
    await saveConfiguredSetup(nextState);
  } catch {
    errorMessage.textContent = SETUP_SAVE_ERROR;
    return;
  }

  try {
    await runPopupVerification(true);
  } catch {
    regularViewErrorMessage = POST_SETUP_VERIFICATION_ERROR;
    renderPopup();
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

  popupRoot.querySelector('[data-action="check-now"]')?.addEventListener("click", () => {
    void runPopupVerification();
  });

  popupRoot.querySelectorAll<HTMLElement>('[data-action="switch-tab"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      switchSettingsTab(readSettingsTab(btn.dataset.tab));
    });

    btn.addEventListener("keydown", (event) => {
      handleSettingsTabKeydown(event);
    });
  });

  const blockedRootsForm = popupRoot.querySelector('[data-role="blocked-roots-form"]');
  const blockedRootsError = popupRoot.querySelector('[data-role="blocked-roots-error"]');
  const protectedSettingsForm = popupRoot.querySelector('[data-role="protected-settings-form"]');
  const protectedSettingsError = popupRoot.querySelector('[data-role="protected-settings-error"]');

  if (
    protectedSettingsForm instanceof HTMLFormElement &&
    protectedSettingsError instanceof HTMLElement
  ) {
    protectedSettingsForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void saveProtectedSettings(protectedSettingsForm, protectedSettingsError);
    });
  }

  if (blockedRootsForm instanceof HTMLFormElement && blockedRootsError instanceof HTMLElement) {
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
  errorMessage: HTMLElement,
): Promise<void> {
  const settingsInput = readProtectedSettingsForm(form);

  if (settingsInput === null) {
    errorMessage.textContent = PROTECTED_SETTINGS_REQUIRED_ERROR;
    return;
  }

  let saveResult: ReturnType<typeof savePendingProtectedSettings>;
  draftProtectedSettings = null;

  try {
    saveResult = await runStateMutation((state) => {
      const mutationResult = savePendingProtectedSettings(state, settingsInput);

      return {
        nextState: mutationResult.kind === "updated" ? mutationResult.state : null,
        result: mutationResult,
      };
    });
  } catch {
    errorMessage.textContent = PROTECTED_SETTINGS_SAVE_ERROR;
    return;
  }

  if (saveResult.kind === "unchanged") {
    errorMessage.textContent = "Protected settings already match the saved values.";
    return;
  }

  if (saveResult.kind === "locked") {
    errorMessage.textContent = formatProtectedSettingsLockedMessage(
      saveResult.nextChangeAvailableOnBrowserLocalDay,
    );
    return;
  }

  draftProtectedSettings = null;
  errorMessage.textContent = "";
}

async function saveBlockedRoot(form: HTMLFormElement, errorMessage: HTMLElement): Promise<void> {
  const blockedRootInput = readFormValue(form, "blockedRoot");

  let result: ReturnType<typeof addBlockedRoot>;
  draftBlockedRoot = "";

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

  draftBlockedRoot = "";
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
    <div class="container">
      <div class="top-bar">
        <div class="brand">LockIn.</div>
      </div>
      
      <div class="status-banner" data-state="setupRequired">
        <h1>Setup</h1>
        <p>LockIn requires initial configuration before starting.</p>
      </div>

      <div class="form-section grow">
        <form data-role="setup-form" class="stack-fill">
          
          <div class="form-row">
            <label class="form-label" for="setup-tracked-profile">Tracked Profile</label>
            <input class="input-brutal" id="setup-tracked-profile" name="trackedProfile" type="text" autocomplete="off" placeholder="leetcode-username" required />
          </div>

          <div class="split-row form-row">
            <div>
              <label class="form-label" for="setup-hard-lock-start">Lock Start</label>
              <input class="input-brutal" id="setup-hard-lock-start" name="hardLockStart" type="time" value="${escapeHtml(DEFAULT_HARD_LOCK_WINDOW.start)}" required />
            </div>
            <div>
              <label class="form-label" for="setup-hard-lock-end">Lock End</label>
              <input class="input-brutal" id="setup-hard-lock-end" name="hardLockEnd" type="time" value="${escapeHtml(DEFAULT_HARD_LOCK_WINDOW.end)}" required />
            </div>
          </div>

          <div class="help-text">
            Default blocked roots are applied automatically on setup.
          </div>
          <div class="error-msg" data-role="setup-error"></div>

          <div class="push-bottom">
            <button class="btn-primary" type="submit">Save Setup</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderMainView(state: ExtensionState): string {
  if (state.currentConfig === null) {
    throw new Error("Regular popup view requires current configuration.");
  }

  const popupStatus = getPopupStatusViewModel(state);
  const checkNowDisabled = isCheckNowDisabled();
  const regularViewError =
    regularViewErrorMessage === ""
      ? ""
      : `<div class="error-msg" style="padding: 0 16px;">${escapeHtml(regularViewErrorMessage)}</div>`;

  const latestAcceptedSolveRow =
    popupStatus.lastAcceptedSolveValue === null
      ? ""
      : `
          <div class="data-row">
            <div class="data-label">Latest Solve</div>
            <div class="data-value">${escapeHtml(popupStatus.lastAcceptedSolveValue)}</div>
          </div>
        `;

  return `
    <div class="container">
      <div class="top-bar">
        <div class="brand">LockIn.</div>
        <button class="nav-btn" type="button" data-action="open-settings">Config</button>
      </div>
      
      <div class="status-banner" data-state="${escapeHtml(popupStatus.kind)}">
        <h1>${escapeHtml(popupStatus.title.toUpperCase())}</h1>
        <p>${escapeHtml(popupStatus.summary)}</p>
      </div>

      <div class="data-grid">
        <div class="data-row">
          <div class="data-label">Profile</div>
          <div class="data-value">${escapeHtml(state.currentConfig.trackedProfile)}</div>
        </div>
        <div class="data-row">
          <div class="data-label">Lock Window</div>
          <div class="data-value">${escapeHtml(formatHardLockWindow(state.currentConfig.hardLockWindow))}</div>
        </div>
        <div class="data-row">
          <div class="data-label">Blocked Roots</div>
          <div class="data-value">${state.blockedRoots.active.length}</div>
        </div>
        <div class="data-row">
          <div class="data-label">${escapeHtml(popupStatus.nextRelevantLabel)}</div>
          <div class="data-value">${escapeHtml(popupStatus.nextRelevantValue)}</div>
        </div>
        ${latestAcceptedSolveRow}
      </div>

      ${regularViewError}

      <div class="btn-action-wrapper">
        <button
          class="btn-primary"
          type="button"
          data-action="check-now"
          ${checkNowDisabled ? "disabled" : ""}
        >
          ${popupVerificationPromise === null ? "Verify Status" : "Checking..."}
        </button>
      </div>
    </div>
  `;
}

function renderSettingsView(state: ExtensionState): string {
  if (state.currentConfig === null) {
    throw new Error("Settings view requires current configuration.");
  }

  const isGeneral = popupSettingsTab === "general";
  const isBlocklist = popupSettingsTab === "blocklist";

  const tabContent = isGeneral
    ? `
      <div class="form-section grow" role="tabpanel" id="settings-panel-general" aria-labelledby="settings-tab-general">
        <h3 class="section-title">Protected Rules</h3>
        ${renderProtectedSettingsSummary(state.currentConfig)}
        ${renderPendingProtectedSettings(state)}
        <div class="mt-24">
          ${renderProtectedSettingsForm(state, { values: draftProtectedSettings })}
        </div>
      </div>
    `
    : `
      <div class="form-section grow" style="padding: 0;" role="tabpanel" id="settings-panel-blocklist" aria-labelledby="settings-tab-blocklist">
        <div class="form-section">
          <h3 class="section-title">Blocklist Controls</h3>
          
          <form class="row-inline" data-role="blocked-roots-form">
            <label class="sr-only" for="blocked-root-input">Blocked Root</label>
            <input
              class="input-brutal input-grow"
              id="blocked-root-input"
              name="blockedRoot"
              type="text"
              autocomplete="off"
              placeholder="youtube.com"
              value="${escapeHtml(draftBlockedRoot)}"
              required
            />
            <button class="btn-secondary" type="submit">ADD</button>
          </form>
          <div class="error-msg mb-16" data-role="blocked-roots-error"></div>
        </div>

        <div class="list-wrapper">
          ${renderUnifiedBlockedRoots(state.blockedRoots.active, state.blockedRoots.pendingRemoval)}
        </div>
      </div>
    `;

  return `
    <div class="container">
      <div class="top-bar">
        <div class="brand">Configuration</div>
        <button class="nav-btn" type="button" data-action="close-settings">Done</button>
      </div>

      <div class="ticket-tabs" role="tablist" aria-label="Configuration sections">
        <button class="ticket-tab ${isGeneral ? "active" : ""}" id="settings-tab-general" role="tab" aria-selected="${String(isGeneral)}" aria-controls="settings-panel-general" tabindex="0" data-action="switch-tab" data-tab="general">Rules</button>
        <button class="ticket-tab ${isBlocklist ? "active" : ""}" id="settings-tab-blocklist" role="tab" aria-selected="${String(isBlocklist)}" aria-controls="settings-panel-blocklist" tabindex="0" data-action="switch-tab" data-tab="blocklist">Blocklist</button>
      </div>

      ${tabContent}
    </div>
  `;
}

function renderPendingProtectedSettings(state: ExtensionState): string {
  if (state.pendingConfig === null) {
    return "";
  }

  return `
    <div class="pending-box">
      <div class="pending-box-title">Pending Next Day</div>
      ${renderProtectedSettingsSummary(state.pendingConfig)}
    </div>
  `;
}

function renderUnifiedBlockedRoots(activeRoots: string[], pendingRemovalRoots: string[]): string {
  if (activeRoots.length === 0) {
    return '<div class="empty-msg">No domains blocked.</div>';
  }

  return activeRoots
    .map((rootName) => {
      const isPendingRemoval = pendingRemovalRoots.includes(rootName);

      if (isPendingRemoval) {
        return `
          <div class="list-item">
            <div class="list-domain pending-strike">
              ${escapeHtml(rootName)}
              <span class="tag-badge">Pending Tomorrow</span>
            </div>
            <button
              class="btn-secondary"
              type="button"
              data-action="cancel-root-removal"
              data-root="${escapeHtml(rootName)}"
            >
              Undo
            </button>
          </div>
        `;
      }

      return `
        <div class="list-item">
          <div class="list-domain">
            ${escapeHtml(rootName)}
          </div>
          <button
            class="btn-secondary"
            type="button"
            data-action="schedule-root-removal"
            data-root="${escapeHtml(rootName)}"
          >
            Remove Tomorrow
          </button>
        </div>
      `;
    })
    .join("");
}

function readSettingsTab(value: string | undefined): "general" | "blocklist" {
  return value === "blocklist" ? "blocklist" : "general";
}

function syncSettingsDrafts(): void {
  const protectedSettingsForm = popupRoot.querySelector<HTMLFormElement>(
    '[data-role="protected-settings-form"]',
  );

  if (protectedSettingsForm instanceof HTMLFormElement) {
    draftProtectedSettings = readProtectedSettingsDraft(protectedSettingsForm);
  }

  const blockedRootsForm = popupRoot.querySelector<HTMLFormElement>(
    '[data-role="blocked-roots-form"]',
  );

  if (blockedRootsForm instanceof HTMLFormElement) {
    draftBlockedRoot = readFormValue(blockedRootsForm, "blockedRoot");
  }
}

function handleSettingsTabKeydown(event: KeyboardEvent): void {
  const currentTab = event.currentTarget;

  if (!(currentTab instanceof HTMLElement)) {
    return;
  }

  const tabs = Array.from(popupRoot.querySelectorAll<HTMLElement>('[data-action="switch-tab"]'));
  const currentIndex = tabs.indexOf(currentTab);

  if (currentIndex === -1) {
    return;
  }

  let nextIndex = currentIndex;

  if (event.key === "ArrowRight") {
    nextIndex = (currentIndex + 1) % tabs.length;
  } else if (event.key === "ArrowLeft") {
    nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = tabs.length - 1;
  } else {
    return;
  }

  event.preventDefault();
  switchSettingsTab(readSettingsTab(tabs[nextIndex]?.dataset.tab), true);
}

function switchSettingsTab(nextTab: "general" | "blocklist", shouldFocus = false): void {
  syncSettingsDrafts();
  popupSettingsTab = nextTab;
  renderPopup();

  if (!shouldFocus) {
    return;
  }

  popupRoot
    .querySelector<HTMLElement>(`[data-action="switch-tab"][data-tab="${popupSettingsTab}"]`)
    ?.focus();
}

function readFormValue(form: HTMLFormElement, fieldName: string): string {
  const fieldValue = new FormData(form).get(fieldName);
  return typeof fieldValue === "string" ? fieldValue : "";
}

function readProtectedSettingsDraft(form: HTMLFormElement): ProtectedSettingsFormValues {
  return {
    trackedProfile: readFormValue(form, "trackedProfile").trim(),
    hardLockStart: readFormValue(form, "hardLockStart"),
    hardLockEnd: readFormValue(form, "hardLockEnd"),
  };
}

function readProtectedSettingsForm(form: HTMLFormElement): ProtectedSettings | null {
  const { trackedProfile, hardLockStart, hardLockEnd } = readProtectedSettingsDraft(form);

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

  if (blockedRootsError instanceof HTMLElement) {
    blockedRootsError.textContent = message;
  }
}

async function runPopupVerification(force = false): Promise<void> {
  if (popupVerificationPromise !== null) {
    await popupVerificationPromise;
    return;
  }

  if (!force && isCheckNowDisabled()) {
    return;
  }

  popupVerificationCooldownUntil = Date.now() + MANUAL_VERIFICATION_DEBOUNCE_MS;
  schedulePopupVerificationCooldownRender();
  regularViewErrorMessage = "";

  popupVerificationPromise = requestDailySolveGateVerification()
    .then((response) => setVerificationStatus(response.verification))
    .catch(() =>
      setVerificationStatus({
        kind: "verificationFailed",
        checkedAt: new Date().toISOString(),
        lastAcceptedSolveAt: extensionState.verification.lastAcceptedSolveAt,
        allowCacheBrowserLocalDay: null,
      }),
    )
    .finally(() => {
      popupVerificationPromise = null;
      renderPopup();
    });

  renderPopup();

  await popupVerificationPromise;
}

function isCheckNowDisabled(now: number = Date.now()): boolean {
  return popupVerificationPromise !== null || now < popupVerificationCooldownUntil;
}

function schedulePopupVerificationCooldownRender(): void {
  if (popupVerificationCooldownTimer !== null) {
    window.clearTimeout(popupVerificationCooldownTimer);
  }

  const cooldownDelay = Math.max(0, popupVerificationCooldownUntil - Date.now());

  popupVerificationCooldownTimer = window.setTimeout(() => {
    popupVerificationCooldownTimer = null;
    renderPopup();
  }, cooldownDelay);
}

async function setVerificationStatus(verification: ExtensionState["verification"]): Promise<void> {
  await writeVerificationStatus(verification);
  await runStateMutation((state) => ({
    nextState: {
      ...state,
      verification,
    },
    result: undefined,
  }));
}

async function saveConfiguredSetup(nextState: ExtensionState): Promise<void> {
  await runStateMutation(() => ({
    nextState,
    result: undefined,
  }));
}
