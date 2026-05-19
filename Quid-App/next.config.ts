import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  allowedDevOrigins: [
    "preview-chat-41b9dbe3-bce7-4662-9956-f567893b29f4.space-z.ai",
    "preview-chat-b80b2029-f1a8-4d96-b68f-f5033414930a.space-z.ai",
    ".space-z.ai",
    ".space.chatglm.site",
    "192.168.1.10",
    ".trycloudflare.com",
    ".cloudflare.com",
    ".roquintc.app",
    "localhost",
    "127.0.0.1",
  ],
  headers: async () => [
    {
      source: "/sw.js",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=0, must-revalidate",
        },
        {
          key: "Service-Worker-Allowed",
          value: "/",
        },
      ],
    },
    {
      source: "/manifest.json",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=604800",
        },
      ],
    },
  ],
};

export default withNextIntl(nextConfig);
