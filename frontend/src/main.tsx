import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import { AuthProvider } from "./auth";
import { App } from "./App";
import { startCardGlow } from "./glow";
import "./styles.css";

startCardGlow();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
