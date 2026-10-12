import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const isGitHubPages = process.env.VITE_DEPLOY_TARGET === "github-pages";

export default defineConfig({
  base: isGitHubPages ? "/softm.seolgyehannun/" : "/",
  plugins: [react()],
  server: {
    port: 5173,
    host: "127.0.0.1",
  },
  preview: {
    port: 4173,
    host: "127.0.0.1",
  },
  build: {
    target: "es2022",
    sourcemap: true,
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "firebase-firestore", test: /node_modules\/@firebase\/firestore/ },
            { name: "firebase-auth", test: /node_modules\/@firebase\/auth/ },
            { name: "firebase-storage", test: /node_modules\/@firebase\/storage/ },
            { name: "firebase-functions", test: /node_modules\/@firebase\/functions/ },
            { name: "firebase-core", test: /node_modules\/@firebase/ },
          ],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["tests/emulator/**", "node_modules/**", "dist/**"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
