import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// One .env at the repo root serves every app.
const rootEnv = new URL("../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  transpilePackages: ["@finvantage/contracts"],
};

export default config;
