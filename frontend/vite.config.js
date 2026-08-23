import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist" },
  // Em desenvolvimento o backend roda à parte (uvicorn na 8000). O proxy leva
  // as chamadas /api até lá, então a interface local fala com dados de verdade
  // sem precisar de VITE_API_BASE nem afrouxar o CORS.
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
});
