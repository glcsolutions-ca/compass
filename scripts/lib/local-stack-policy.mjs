function freezePolicy(policy) {
  return Object.freeze(policy);
}

export const devPolicy = freezePolicy({
  name: "dev",
  requiredServices: ["database", "api", "web"],
  startupTarget: "full",
  reuseExisting: true,
  allowBrowserOpen: true,
  cleanupIfStarted: true,
  runForegroundApps: true,
  buildWorkflowEnv: (env) => env
});

export const integrationPolicy = freezePolicy({
  name: "test:integration",
  requiredServices: ["database"],
  startupTarget: "dependencies",
  reuseExisting: true,
  allowBrowserOpen: false,
  cleanupIfStarted: true,
  runForegroundApps: false,
  buildWorkflowEnv: (env) => env
});

export const acceptanceApiPolicy = freezePolicy({
  name: "test:acceptance:api",
  requiredServices: ["database", "api"],
  startupTarget: "api",
  reuseExisting: true,
  allowBrowserOpen: false,
  cleanupIfStarted: true,
  runForegroundApps: false,
  buildWorkflowEnv: (env) => ({
    ...env,
    BASE_URL: env.VITE_API_BASE_URL,
    TARGET_API_BASE_URL: env.VITE_API_BASE_URL
  })
});

export const acceptanceWebPolicy = freezePolicy({
  name: "test:acceptance:web",
  requiredServices: ["database", "api", "web"],
  startupTarget: "full",
  reuseExisting: true,
  allowBrowserOpen: false,
  cleanupIfStarted: true,
  runForegroundApps: false,
  buildWorkflowEnv: (env) => ({
    ...env,
    WEB_BASE_URL: env.WEB_BASE_URL
  })
});

export const acceptanceDesktopPolicy = freezePolicy({
  name: "test:acceptance:desktop",
  requiredServices: [],
  startupTarget: "none",
  reuseExisting: true,
  allowBrowserOpen: false,
  cleanupIfStarted: true,
  runForegroundApps: false,
  buildWorkflowEnv: (env) => env
});
