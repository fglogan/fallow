import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { babelInspectorSource } from "../../src/inspector/babelInspectorSource";

// Stamp data-plow-source relative to the review/project root so the picker's
// paths match `plow review` output (same path-space = correct JOIN).
const projectRoot = resolve(import.meta.dirname, "../../../..");
const appRoot = resolve(import.meta.dirname, "../..");

export default defineConfig(({ command }) => ({
  plugins: [
    react({
      // Dev only: never ship data-plow-source in a production build.
      babel: {
        plugins: command === "serve" ? [[babelInspectorSource, { root: projectRoot }]] : [],
      },
    }),
  ],
  // Allow importing the shared inspector picker from apps/review-electron/src.
  server: { port: 5273, fs: { allow: [appRoot] } },
}));
