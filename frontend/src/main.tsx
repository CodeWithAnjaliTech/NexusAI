import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initTheme } from "./stores/chatStore";
import { useAuthStore } from "./stores/authStore";
import "./index.css";

initTheme();
useAuthStore.getState().loadFromStorage();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
