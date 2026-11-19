import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" makes the built site work from any subfolder, including
// GitHub Pages' https://<username>.github.io/<repo-name>/
export default defineConfig({
  plugins: [react()],
  base: "./",
});
