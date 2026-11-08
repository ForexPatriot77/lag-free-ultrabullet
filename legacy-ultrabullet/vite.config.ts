import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS === "true" ? "/lag-free-ultrabullet/" : "/",
  server: {
    host: "0.0.0.0"
  }
});