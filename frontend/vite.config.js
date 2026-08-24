import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("./package.json", "utf8"));

export default defineConfig({
  plugins: [react()],
  // A versão vai para dentro do app, para aparecer nos Ajustes. Mantenha igual
  // ao versionName de android/app/build.gradle — é por ela que a pessoa diz
  // qual versão está usando quando alguma coisa dá errado.
  define: { __VERSAO__: JSON.stringify(version) },
  build: { outDir: "dist" },
  // Em desenvolvimento o backend roda à parte (uvicorn na 8000). O proxy leva
  // as chamadas /api até lá, então a interface local fala com dados de verdade
  // sem precisar de VITE_API_BASE nem afrouxar o CORS.
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
});
