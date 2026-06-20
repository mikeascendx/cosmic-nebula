import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cosmic Nebula is 100% client-side, so we ship a fully static export.
  // `next build` emits an `out/` directory of static files — exactly what
  // Cloudflare Pages serves. No Node server, no edge runtime needed.
  output: "export",
  // Dev-only: allow loading dev chunks/HMR when the app is opened via 127.0.0.1
  // or the LAN IP. Ignored by the static export, so it has no production effect.
  allowedDevOrigins: ["127.0.0.1", "100.76.178.17"],
  images: {
    // next/image optimisation needs a server; static export requires this.
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
