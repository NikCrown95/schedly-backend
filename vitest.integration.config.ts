import { defineConfig } from "vitest/config";
import path from "node:path";

// Config separata da vitest.config.ts (che gira con dipendenze mockate): questa
// esegue i test di integrazione contro un vero database Postgres di test —
// vedi tests/integration/setup.ts e .env.test.example.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    testTimeout: 20_000,
    // I test di integrazione condividono lo stesso DB e fanno TRUNCATE tra un
    // file e l'altro: eseguirli in parallelo causerebbe interferenze.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@modules": path.resolve(__dirname, "src/modules"),
      "@shared": path.resolve(__dirname, "src/shared"),
      "@config": path.resolve(__dirname, "src/config"),
    },
  },
});
