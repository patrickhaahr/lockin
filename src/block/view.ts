type BlockPageViewModel = {
  blockedHostname: string | null;
  originalDestination: string;
};

const BLOCK_PAGE_STYLES = `
:host {
  color: #f4f7fb;
  font-family: Inter, system-ui, sans-serif;
  font-synthesis: none;
  line-height: 1.5;
  font-weight: 400;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
}

.page-shell {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 24px;
  background: radial-gradient(circle at top, rgba(77, 119, 255, 0.28), transparent 48%), #101423;
}

.page-panel {
  width: min(100%, 560px);
  border: 1px solid rgba(164, 180, 255, 0.18);
  border-radius: 20px;
  background: rgba(10, 15, 30, 0.9);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
  padding: 24px;
}

.eyebrow {
  margin: 0 0 8px;
  color: #94a6ff;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1,
p,
dl,
dd,
dt {
  margin: 0;
}

h1 {
  font-size: 1.9rem;
  line-height: 1.15;
}

.body-copy {
  margin-top: 14px;
  color: #c5d0f7;
}

.details-list {
  margin-top: 20px;
}

.details-row + .details-row {
  margin-top: 16px;
}

dt {
  color: #95a4d9;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

dd {
  margin-top: 6px;
  color: #f4f7fb;
  word-break: break-word;
}
`;

export function createBlockPageViewModel(originalDestination: string): BlockPageViewModel {
  return {
    blockedHostname: getOriginalHostname(originalDestination),
    originalDestination,
  };
}

export function mountBlockPage(target: ShadowRoot | HTMLElement, model: BlockPageViewModel): void {
  const documentRef = target.ownerDocument;

  if (documentRef === null) {
    throw new Error("Missing owner document for block page target.");
  }

  if (target instanceof ShadowRoot) {
    const stylesheet = new CSSStyleSheet();
    stylesheet.replaceSync(BLOCK_PAGE_STYLES);
    target.adoptedStyleSheets = [stylesheet];
  }

  const shell = documentRef.createElement("main");
  shell.className = "page-shell";

  const panel = documentRef.createElement("section");
  panel.className = "page-panel";

  const eyebrow = documentRef.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Block Page";

  const title = documentRef.createElement("h1");
  title.textContent = "Access to this Blocked Site is currently denied";

  const bodyCopy = documentRef.createElement("p");
  bodyCopy.className = "body-copy";
  bodyCopy.textContent =
    "This tab stays blocked until LockIn determines that access is allowed again.";

  const detailsList = documentRef.createElement("dl");
  detailsList.className = "details-list";
  detailsList.append(
    createDetailsRow(documentRef, "Blocked hostname", model.blockedHostname ?? "Unavailable"),
    createDetailsRow(documentRef, "Original destination", model.originalDestination),
  );

  panel.append(eyebrow, title, bodyCopy, detailsList);
  shell.append(panel);
  target.replaceChildren(shell);
}

function createDetailsRow(documentRef: Document, label: string, value: string): HTMLDivElement {
  const row = documentRef.createElement("div");
  row.className = "details-row";

  const term = documentRef.createElement("dt");
  term.textContent = label;

  const description = documentRef.createElement("dd");
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
