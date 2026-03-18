import type { NextConfig } from "next"

const config: NextConfig = {
  transpilePackages: ["@acme/ui", "@acme/shared"],
  experimental: {
    serverActions: { allowedOrigins: ["localhost:3000"] },
  },
}

export default config
