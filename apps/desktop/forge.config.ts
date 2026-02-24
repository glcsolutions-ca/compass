function resolveGithubRepository(): {
  owner: string;
  name: string;
} | null {
  const repository = process.env.GITHUB_REPOSITORY?.trim();
  if (!repository) {
    return null;
  }

  const [owner, name] = repository.split("/");
  if (!owner || !name) {
    return null;
  }

  return { owner, name };
}

const githubRepository = resolveGithubRepository();

const config = {
  packagerConfig: {
    appBundleId: "ca.glsolutions.compass.desktop",
    asar: true,
    executableName: "Compass",
    name: "Compass",
    prune: false,
    extraResource: ["dist/desktop-runtime.json"],
    ignore: [
      /^\/src($|\/)/,
      /^\/scripts($|\/)/,
      /^\/node_modules($|\/)/,
      /^\/tsconfig\..+$/,
      /^\/vitest\.config\.mts$/,
      /^\/README\.md$/
    ],
    osxSign: process.env.APPLE_TEAM_ID
      ? {
          identity: "Developer ID Application",
          hardenedRuntime: true,
          entitlements: "build/entitlements.plist",
          entitlementsInherit: "build/entitlements.inherit.plist"
        }
      : undefined,
    osxNotarize:
      process.env.APPLE_TEAM_ID &&
      process.env.APPLE_API_KEY_PATH &&
      process.env.APPLE_API_KEY_ID &&
      process.env.APPLE_API_ISSUER_ID
        ? {
            tool: "notarytool",
            appleApiKey: process.env.APPLE_API_KEY_PATH,
            appleApiKeyId: process.env.APPLE_API_KEY_ID,
            appleApiIssuer: process.env.APPLE_API_ISSUER_ID,
            teamId: process.env.APPLE_TEAM_ID
          }
        : undefined
  },
  makers: [
    {
      name: "@electron-forge/maker-dmg",
      platforms: ["darwin"],
      config: {
        name: "Compass"
      }
    },
    {
      name: "@electron-forge/maker-wix",
      platforms: ["win32"],
      config: {
        language: 1033,
        manufacturer: "Compass"
      }
    }
  ],
  publishers: githubRepository
    ? [
        {
          name: "@electron-forge/publisher-github",
          config: {
            repository: githubRepository,
            draft: true,
            prerelease: false
          }
        }
      ]
    : []
};

export default config;
