import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  /* your existing config */
};

initOpenNextCloudflareForDev();

export default nextConfig;