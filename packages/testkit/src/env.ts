export type EnvPatch = Record<string, string | undefined>;

export async function withEnv<T>(
  patch: EnvPatch,
  run: () => Promise<T> | T,
  env: NodeJS.ProcessEnv = process.env
): Promise<T> {
  const previousValues = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(patch)) {
    previousValues.set(key, env[key]);
    if (value === undefined) {
      delete env[key];
      continue;
    }

    env[key] = value;
  }

  try {
    return await run();
  } finally {
    for (const [key, previousValue] of previousValues.entries()) {
      if (previousValue === undefined) {
        delete env[key];
        continue;
      }

      env[key] = previousValue;
    }
  }
}
