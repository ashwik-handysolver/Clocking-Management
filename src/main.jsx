import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// Coming back with the browser's Back button (e.g. after cancelling Google sign-in) can restore a
// frozen copy of the page whose live connections were closed. Load it fresh instead.
window.addEventListener("pageshow", (e) => {
  if (e.persisted) window.location.reload();
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
