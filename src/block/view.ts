import type { ExtensionState } from "@/shared/types";
import { getBlockedSiteBlockReasonForStatus } from "@/shared/blocked-site-policy";
import {
  getBlockedReasonLabel,
  getBlockedSiteStatusViewModel,
} from "@/shared/blocked-site-presentation";

type BlockPageViewModel = {
  blockedReasonLabel: string;
  blockedHostname: string | null;
  isCheckAgainDisabled: boolean;
  isChecking: boolean;
  lastAcceptedSolveValue: string | null;
  nextRelevantLabel: string;
  nextRelevantValue: string;
  originalDestination: string;
  summary: string;
  title: string;
};

type BlockPageActions = {
  onCheckAgain?: () => void;
};

const BLOCK_PAGE_FONT_IMPORT =
  '@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap");';

function getBlockPageStyles(rootSelector: string): string {
  return `
${rootSelector} {
  --bg: #0b0b0b;
  --surface: #131313;
  --surface-soft: #1a1a1a;
  --fg: #f2efe4;
  --fg-muted: #8a877e;
  --border: #2a2a28;
  --border-strong: #f2efe4;
  --alert: #e53935;
  --alert-fg: #ffffff;

  color: var(--fg);
  font-family: "Inter", system-ui, sans-serif;
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  line-height: 1.4;
}

* {
  box-sizing: border-box;
}

.page {
  display: grid;
  grid-template-rows: auto 1fr auto;
  grid-template-areas: "top" "stage" "foot";
  min-height: 100vh;
  width: 100%;
  padding: 24px;
  gap: 24px;
  justify-items: center;
  background-color: var(--bg);
  background-image: radial-gradient(
    circle at 1px 1px,
    rgba(242, 239, 228, 0.12) 1px,
    transparent 1.6px
  );
  background-size: 22px 22px;
}

.top-bar { grid-area: top; width: 100%; }
.panel   { grid-area: stage; justify-self: center; align-self: center; }
.foot    { grid-area: foot; width: 100%; }

/* TOP BAR */
.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid var(--border);
  background: var(--surface);
  padding: 12px 16px;
}

.brand {
  font-weight: 900;
  font-size: 18px;
  letter-spacing: -0.04em;
  text-transform: uppercase;
}

.brand-dot { color: var(--alert); }

.top-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.12em;
  color: var(--fg-muted);
  text-transform: uppercase;
}

.top-meta-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  background: var(--alert);
  animation: pulse 1.6s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* PANEL (the card; first child of .page, the element tests target) */
.panel {
  position: relative;
  width: min(100%, 560px);
  display: flex;
  flex-direction: column;
  border: 2px solid var(--border-strong);
  background: var(--surface);
  box-shadow: 8px 8px 0 var(--alert);
}

.panel::before,
.panel::after {
  content: "";
  position: absolute;
  width: 14px;
  height: 14px;
  border: 1px solid var(--fg-muted);
  pointer-events: none;
}

.panel::before {
  top: -12px;
  left: -12px;
  border-right: none;
  border-bottom: none;
}

.panel::after {
  bottom: -12px;
  right: -12px;
  border-left: none;
  border-top: none;
}

.panel > .eyebrow,
.panel > h1,
.panel > .summary {
  background: var(--alert);
  color: var(--alert-fg);
  padding-left: 24px;
  padding-right: 24px;
  margin: 0;
}

.panel > .eyebrow {
  padding-top: 24px;
  padding-bottom: 0;
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 10px;
}

.panel > .eyebrow::before {
  content: "";
  display: inline-block;
  width: 24px;
  height: 1px;
  background: currentColor;
}

.panel > h1 {
  padding-top: 12px;
  padding-bottom: 0;
  font-size: clamp(32px, 5vw, 46px);
  font-weight: 900;
  letter-spacing: -0.03em;
  text-transform: uppercase;
  line-height: 0.95;
}

.panel > .summary {
  padding-top: 14px;
  padding-bottom: 26px;
  border-bottom: 2px solid var(--border-strong);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.45;
  max-width: none;
  opacity: 0.95;
}

/* DATA GRID */
.details {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  background: var(--surface);
}

.details-row {
  display: flex;
  border-bottom: 1px solid var(--border);
  margin: 0;
}

.details-row:last-child {
  border-bottom: none;
}

.details-label {
  width: 40%;
  padding: 14px 16px;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--fg-muted);
  border-right: 1px solid var(--border);
  display: flex;
  align-items: center;
  line-height: 1.3;
}

.details-value {
  width: 60%;
  padding: 14px 16px;
  font-family: "JetBrains Mono", monospace;
  font-size: 13px;
  font-weight: 500;
  color: var(--fg);
  display: flex;
  align-items: center;
  word-break: break-all;
  line-height: 1.45;
}

.details-value.is-long {
  font-family: "Inter", sans-serif;
  font-weight: 500;
  word-break: normal;
}

/* ACTION */
.action {
  border-top: 2px solid var(--border-strong);
  background: var(--surface-soft);
  display: flex;
}

.check-again-button {
  flex: 1;
  background: var(--fg);
  color: var(--bg);
  border: none;
  padding: 18px 16px;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition: background-color 120ms, color 120ms;
}

.check-again-button:hover:not(:disabled) {
  background: var(--alert);
  color: var(--alert-fg);
}

.check-again-button:focus-visible {
  outline: 2px solid var(--alert);
  outline-offset: -6px;
}

.check-again-button:disabled {
  cursor: wait;
  opacity: 0.5;
}

/* FOOTER */
.foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.16em;
  color: var(--fg-muted);
  text-transform: uppercase;
  padding: 0 4px;
}

.foot-id {
  display: flex;
  gap: 16px;
}

@media (max-width: 520px) {
  .page { padding: 16px; }
  .panel > .eyebrow { padding: 16px 16px 0; }
  .panel > h1 { padding: 10px 16px 0; }
  .panel > .summary { padding: 12px 16px 18px; }
  .details-label { width: 45%; padding: 12px; font-size: 10px; }
  .details-value { width: 55%; padding: 12px; font-size: 12px; }
  .panel::before, .panel::after { display: none; }
}
`;
}

export function createBlockPageViewModel(
  state: ExtensionState,
  originalDestination: string,
  now: Date = new Date(),
  isChecking = false,
  isCheckAgainDisabled = isChecking,
): BlockPageViewModel {
  const blockedSiteStatus = getBlockedSiteStatusViewModel(state, now);
  const blockedReason = getBlockedReasonForStatus(blockedSiteStatus.kind);

  return {
    blockedReasonLabel: getBlockedReasonLabel(blockedReason),
    blockedHostname: getOriginalHostname(originalDestination),
    isCheckAgainDisabled,
    isChecking,
    lastAcceptedSolveValue: blockedSiteStatus.lastAcceptedSolveValue,
    nextRelevantLabel: blockedSiteStatus.nextRelevantLabel,
    nextRelevantValue: blockedSiteStatus.nextRelevantValue,
    originalDestination,
    summary: blockedSiteStatus.summary,
    title: blockedSiteStatus.title,
  };
}

function getBlockedReasonForStatus(
  status: ReturnType<typeof getBlockedSiteStatusViewModel>["kind"],
): ReturnType<typeof getBlockedSiteBlockReasonForStatus> {
  if (status === "allowedToday") {
    return "blockedByDailySolveGate";
  }

  return getBlockedSiteBlockReasonForStatus(status);
}

export function mountBlockPage(
  target: ShadowRoot | HTMLElement,
  model: BlockPageViewModel,
  actions: BlockPageActions = {},
): void {
  const { onCheckAgain } = actions;
  const documentRef = target.ownerDocument;

  if (documentRef === null) {
    throw new Error("Missing owner document for block page target.");
  }

  let shadowRootFontStyles: HTMLStyleElement | null = null;

  if (target instanceof ShadowRoot) {
    const stylesheet = new CSSStyleSheet();
    stylesheet.replaceSync(getBlockPageStyles(":host"));
    target.adoptedStyleSheets = [stylesheet];

    shadowRootFontStyles = documentRef.createElement("style");
    shadowRootFontStyles.textContent = BLOCK_PAGE_FONT_IMPORT;
  }

  let inlineStyles: HTMLStyleElement | null = null;

  if (target instanceof HTMLElement) {
    inlineStyles = documentRef.createElement("style");
    inlineStyles.textContent = `${BLOCK_PAGE_FONT_IMPORT}\n${getBlockPageStyles(".page")}`;
  }

  const page = documentRef.createElement("main");
  page.className = "page";

  // Panel is the focal card. It MUST be page.children[0] per renderer test contract.
  const panel = documentRef.createElement("article");
  panel.className = "panel";

  // Children of panel (test contract: [eyebrow, h1, summary, details, action])
  const eyebrow = documentRef.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Block Page";

  const title = documentRef.createElement("h1");
  title.textContent = model.title;

  const summary = documentRef.createElement("p");
  summary.className = "summary";
  summary.textContent = model.summary;

  const details = documentRef.createElement("dl");
  details.className = "details";

  const detailRows = [
    createDetailsRow(documentRef, "Blocked because", model.blockedReasonLabel),
    createDetailsRow(documentRef, "Blocked hostname", model.blockedHostname ?? "Unavailable"),
    createDetailsRow(documentRef, "Original destination", model.originalDestination),
  ];

  if (model.lastAcceptedSolveValue !== null) {
    detailRows.push(
      createDetailsRow(documentRef, "Latest Accepted Solve", model.lastAcceptedSolveValue),
    );
  }

  detailRows.push(
    createDetailsRow(documentRef, model.nextRelevantLabel, model.nextRelevantValue, {
      isLongValue: true,
    }),
  );
  details.append(...detailRows);

  const action = documentRef.createElement("div");
  action.className = "action";

  if (model.isCheckAgainDisabled || onCheckAgain !== undefined) {
    const checkAgainButton = documentRef.createElement("button");
    checkAgainButton.className = "check-again-button";
    checkAgainButton.type = "button";
    checkAgainButton.disabled = model.isCheckAgainDisabled;
    checkAgainButton.textContent = model.isChecking ? "Checking..." : "Check again";

    if (onCheckAgain !== undefined) {
      checkAgainButton.onclick = onCheckAgain;
    }

    action.append(checkAgainButton);
  }

  panel.append(eyebrow, title, summary, details, action);

  // TOP BAR
  const topBar = documentRef.createElement("header");
  topBar.className = "top-bar";

  const brand = documentRef.createElement("span");
  brand.className = "brand";
  const brandText = documentRef.createElement("span");
  brandText.textContent = "Lockin";
  const brandDot = documentRef.createElement("span");
  brandDot.className = "brand-dot";
  brandDot.textContent = ".";
  brand.append(brandText, brandDot);

  const topMeta = documentRef.createElement("span");
  topMeta.className = "top-meta";
  const metaDot = documentRef.createElement("span");
  metaDot.className = "top-meta-dot";
  const metaLabel = documentRef.createElement("span");
  metaLabel.textContent = "Access Denied";
  topMeta.append(metaDot, metaLabel);

  topBar.append(brand, topMeta);

  // FOOTER
  const foot = documentRef.createElement("footer");
  foot.className = "foot";

  const footLeft = documentRef.createElement("div");
  footLeft.className = "foot-id";
  const footA = documentRef.createElement("span");
  footA.textContent = "Lockin // Block Page";
  footLeft.append(footA);

  const footRight = documentRef.createElement("div");
  footRight.textContent = "Stay Locked In.";

  foot.append(footLeft, footRight);

  // Panel must remain page.children[0] per renderer test contract.
  // CSS grid-area positions panel visually in the center row.
  page.append(panel, topBar, foot);

  if (shadowRootFontStyles !== null) {
    page.append(shadowRootFontStyles);
  }
  if (inlineStyles !== null) {
    target.replaceChildren(inlineStyles, page);
    return;
  }

  target.replaceChildren(page);
}

function createDetailsRow(
  documentRef: Document,
  label: string,
  value: string,
  { isLongValue = false }: { isLongValue?: boolean } = {},
): HTMLDivElement {
  const row = documentRef.createElement("div");
  row.className = "details-row";

  const term = documentRef.createElement("dt");
  term.className = "details-label";
  term.textContent = label;

  const description = documentRef.createElement("dd");
  description.className = isLongValue ? "details-value is-long" : "details-value";
  description.textContent = value;

  row.append(term, description);
  return row;
}

function getOriginalHostname(destination: string): string | null {
  try {
    return new URL(destination).hostname;
  } catch {
    return null;
  }
}
