import type { NextConfig } from "next";

type ExtensionAliasValue = string | string[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toExtensionAlias(value: unknown): Record<string, ExtensionAliasValue> {
  if (!isRecord(value)) {
    return {};
  }

  const aliases: Record<string, ExtensionAliasValue> = {};

  for (const [key, aliasValue] of Object.entries(value)) {
    if (typeof aliasValue === "string") {
      aliases[key] = aliasValue;
      continue;
    }

    if (Array.isArray(aliasValue) && aliasValue.every((entry) => typeof entry === "string")) {
      aliases[key] = aliasValue;
    }
  }

  return aliases;
}

const nextConfig: NextConfig = {
  output: "standalone",
  eslint: {
    // Lint is enforced in CI via `pnpm test:static`; skip duplicate lint during `next build`.
    ignoreDuringBuilds: true
  },
  transpilePackages: ["@compass/sdk"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive, nosnippet, noimageindex"
          }
        ]
      }
    ];
  },
  webpack: (rawConfig: unknown): unknown => {
    if (!isRecord(rawConfig)) {
      return rawConfig;
    }

    const resolve = isRecord(rawConfig.resolve) ? { ...rawConfig.resolve } : {};
    const extensionAlias = toExtensionAlias(resolve.extensionAlias);

    resolve.extensionAlias = {
      ...extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"]
    };

    rawConfig.resolve = resolve;

    return rawConfig;
  }
};

export default nextConfig;
