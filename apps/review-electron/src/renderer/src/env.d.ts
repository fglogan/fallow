import type { PlowApi } from "../../preload";

declare global {
  interface Window {
    plow: PlowApi;
  }
}
