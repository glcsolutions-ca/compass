export function parseCliArgs(argv = process.argv.slice(2)) {
  const parsed = {
    _: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--") {
      continue;
    }

    if (!token.startsWith("--")) {
      parsed._.push(token);
      continue;
    }

    const key = token.slice(2).trim();
    if (!key) {
      throw new Error(`Invalid option token: '${token}'`);
    }

    const next = argv[index + 1];
    if (typeof next === "undefined" || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    if (Object.hasOwn(parsed, key)) {
      const existing = parsed[key];
      if (Array.isArray(existing)) {
        existing.push(next);
      } else {
        parsed[key] = [existing, next];
      }
    } else {
      parsed[key] = next;
    }

    index += 1;
  }

  return parsed;
}

export function requireOption(options, name) {
  const value = options[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required option --${name}`);
  }
  return value.trim();
}

export function optionalOption(options, name) {
  const value = options[name];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
