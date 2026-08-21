import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // The detached TypeScript CLI process emits no stdout under this WSL host.
    // The compiler API performs the same production-build type check reliably.
    useTypeScriptCli: false,
  },
};

export default nextConfig;
