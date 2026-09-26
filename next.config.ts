import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/balancesheet",
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Attachments go through a server action; allow 10 MB files plus form overhead.
      bodySizeLimit: "11mb",
    },
  },
};

export default nextConfig;
