import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR === ".next-e2e" ? ".next-e2e" : ".next",
  experimental: {
    // The detached TypeScript CLI process emits no stdout under this WSL host.
    // The compiler API performs the same production-build type check reliably.
    useTypeScriptCli: false,
  },
};

export default nextConfig;
