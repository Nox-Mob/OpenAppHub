import { readFileSync } from "node:fs";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { parse } from "jsonc-parser";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

type WranglerConfig = {
  vars?: Record<string, string>;
  env?: Record<string, { vars?: Record<string, string> }>;
};

/**
 * Public settings (VITE_*) live in wrangler.jsonc `vars`, per environment
 * (SHARED-SPEC §7.1). The Worker reads them at run time; this makes the same
 * values available to the browser bundle at build time, so there is one
 * source of truth. `.env.local` (untracked) overrides them for local work.
 */
function publicVarsFromWrangler(cfEnv: string | undefined): Record<string, string> {
  const config = parse(readFileSync("wrangler.jsonc", "utf8")) as WranglerConfig;
  const vars = cfEnv ? (config.env?.[cfEnv]?.vars ?? {}) : (config.vars ?? {});
  return Object.fromEntries(Object.entries(vars).filter(([key]) => key.startsWith("VITE_")));
}

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), "VITE_");
  const wranglerVars = publicVarsFromWrangler(process.env["CLOUDFLARE_ENV"]);
  const define: Record<string, string> = {};
  for (const [key, value] of Object.entries(wranglerVars)) {
    if (fileEnv[key] === undefined) define[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  return {
    define,
    server: { port: 3000 },
    plugins: [
      cloudflare({ viteEnvironment: { name: "ssr" } }),
      tsconfigPaths(),
      tailwindcss(),
      tanstackStart({ server: { entry: "server" } }),
      viteReact(),
    ],
  };
});
