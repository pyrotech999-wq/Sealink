import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Dev server is bound to 0.0.0.0 so agents can reach it. Browsers on this
  // machine use 127.0.0.1, which Next blocks unless it is listed here.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
