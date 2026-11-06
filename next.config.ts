import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Every screen is per-user and behind sign-in, so Cache Components (static shells) is off:
// pages render dynamically per request, which keeps auth and RLS reads simple.
const nextConfig: NextConfig = {
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
