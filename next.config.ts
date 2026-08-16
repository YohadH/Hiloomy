import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Allow the production build to use a separate output directory so it never
  // races a concurrently-running `next dev` server over the shared `.next`
  // folder (which causes intermittent "Cannot find module for page" / missing
  // manifest ENOENT failures during "Collecting page data").
  // Defaults to ".next" when NEXT_DIST_DIR is unset, preserving normal behavior.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Limit build-time page-data collection to a single worker. On
  // memory-constrained hosts the default multi-worker fan-out can OOM-kill
  // workers during "Collecting page data" (silent crash, no BUILD_ID).
  // Serial collection is slightly slower but reliable.
  experimental: {
    cpus: 1,
    workerThreads: false,
    // Reduce peak webpack memory during the production build by freeing
    // per-module data between compilations. The build (147 entry points +
    // heavy deps) was OOM-ing on Render (SA-FIX4); this trims real memory use
    // rather than only raising the heap ceiling. Slightly slower build, but
    // behavior-preserving for the emitted output.
    webpackMemoryOptimizations: true
  },
  // Skip ESLint during the production build. Linting runs in the same
  // "Linting and checking validity of types" pass that was OOM-ing the build
  // worker on Render (SIGABRT, heap exhaustion). Disabling ESLint here removes
  // that extra work from the build; TypeScript type errors are still caught
  // (typescript.ignoreBuildErrors stays false). Lint locally / in CI instead.
  eslint: {
    ignoreDuringBuilds: true
  },
  // Keep type-checking enabled — we want type errors to fail the build, we just
  // don't want ESLint piling onto the same memory-constrained pass.
  typescript: {
    ignoreBuildErrors: false
  },
  // Native server-only modules — keep external so Next doesn't try to bundle them.
  // Playwright: Instagram crawler. Sharp: Creative image compositor.
  // fluent-ffmpeg + ffmpeg-static: Creative video pipeline.
  serverExternalPackages: [
    "playwright",
    "playwright-core",
    "sharp",
    "fluent-ffmpeg",
    "ffmpeg-static"
  ]
};

export default nextConfig;
