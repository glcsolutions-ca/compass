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
