import { getBlockedSiteAccessDecision } from "@/shared/blocked-site-policy";
import { createBlockPageViewModel, mountBlockPage } from "./view";
import { createEmptyExtensionState } from "@/shared/state";
import "./style.css";

const root = document.querySelector("#app");

if (!(root instanceof HTMLDivElement)) {
  throw new Error("Missing block page root element.");
}

const originalDestination = new URL(window.location.href).searchParams.get("url");
if (originalDestination !== null) {
  const initialState = createEmptyExtensionState();
  const blockedDecision = getBlockedSiteAccessDecision(initialState);

  if (blockedDecision.kind !== "block") {
    throw new Error("Standalone block page requires a blocked state.");
  }

  mountBlockPage(root, createBlockPageViewModel(initialState, originalDestination));
}
