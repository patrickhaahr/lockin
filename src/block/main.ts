import { escapeHtml } from "@/shared/html";
import "./style.css";

const root = document.querySelector("#app");

if (!(root instanceof HTMLDivElement)) {
  throw new Error("Missing block page root element.");
}

const originalDestination = new URL(window.location.href).searchParams.get("url");

root.innerHTML = `
  <main class="page-shell">
    <section class="page-panel">
      <p class="eyebrow">Block Page</p>
      <h1>LockIn is ready to explain blocked tabs</h1>
      <p class="body-copy">
        Slice 1 only scaffolds the local block page entrypoint. Later slices will connect it to live blocking reasons and retry actions.
      </p>
      <dl class="details-list">
        <div>
          <dt>Original destination</dt>
          <dd>${escapeHtml(originalDestination ?? "Not provided")}</dd>
        </div>
      </dl>
    </section>
  </main>
`;
