/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // A API só libera CORS para a origem http://localhost:5173 (WEB_ORIGIN). Se essa porta
    // estiver ocupada, o Vite por padrão migra silenciosamente para outra porta — o app abre
    // normalmente, mas todo fetch para a API quebra por CORS de um jeito confuso de depurar
    // (ex: login "falha" sem explicação). strictPort força um erro alto e claro em vez disso.
    strictPort: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      thresholds: { statements: 13, branches: 15, functions: 9, lines: 14 },
    },
  },
});
