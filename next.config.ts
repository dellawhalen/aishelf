import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.AISHELF_TEST_DIST_DIR ?? ".next",
  typescript: {
    tsconfigPath: process.env.AISHELF_TEST_TSCONFIG ?? "tsconfig.json",
  },
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
