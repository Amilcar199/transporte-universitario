import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { brand } from "@uni/shared";
import { App } from "./App.tsx";
import "./styles.css";

const root = document.documentElement;
for (const [key, value] of Object.entries(brand.colors)) root.style.setProperty(`--${key}`, value);
root.style.setProperty("--font", brand.font.family);
for (const [key, value] of Object.entries(brand.radius)) root.style.setProperty(`--radius-${key}`, `${value}px`);
document.title = `${brand.name} — Painel administrativo`;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
