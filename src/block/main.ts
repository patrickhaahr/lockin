import { createBlockPageViewModel, mountBlockPage } from "./view";
import { createEmptyExtensionState } from "@/shared/state";
import "./style.css";

const root = document.querySelector("#app");

if (!(root instanceof HTMLDivElement)) {
  throw new Error("Missing block page root element.");
}

const originalDestination = new URL(window.location.href).searchParams.get("url");
if (originalDestination !== null) {
  mountBlockPage(
    root,
    createBlockPageViewModel(createEmptyExtensionState(), "setupRequired", originalDestination),
  );
}
