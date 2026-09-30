// Global styles first so feature stylesheets (imported by components) can override them.
import "@fontsource-variable/inter";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/layout.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { initSync } from "./sync/engine";

registerSW({ immediate: true });
void initSync();

if (import.meta.env.DEV) {
  // handy for poking at state from the devtools console
  import("./store/useStore").then(({ useStore }) => {
    (window as unknown as { store: typeof useStore }).store = useStore;
  });
  if (new URLSearchParams(location.search).has("demo")) {
    import("./dev/demo").then(({ loadDemo }) => loadDemo());
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
