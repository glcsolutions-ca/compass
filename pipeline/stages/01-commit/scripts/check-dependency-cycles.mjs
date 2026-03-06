import { pathToFileURL } from "node:url";
import path from "node:path";
import madge from "madge";

const GRAPH_TARGETS = [
  {
    name: "api",
    root: "apps/api/src",
    tsConfig: "apps/api/tsconfig.json",
    extensions: ["ts"]
  },
  {
    name: "web",
    root: "apps/web/app",
    tsConfig: "apps/web/tsconfig.json",
    extensions: ["ts", "tsx"]
  }
];

function prettyCycle(cycle) {
  return cycle.map((entry) => path.normalize(entry)).join(" -> ");
}

export async function checkDependencyCycles() {
  const allCycles = [];

  for (const target of GRAPH_TARGETS) {
    const result = await madge(target.root, {
      fileExtensions: target.extensions,
      includeNpm: false,
      tsConfig: target.tsConfig
    });

    for (const cycle of result.circular()) {
      allCycles.push({
        target: target.name,
        cycle
      });
    }
  }

  if (allCycles.length > 0) {
    console.error("Dependency cycle gate failed. Circular imports found:");
    for (const entry of allCycles) {
      console.error(`- [${entry.target}] ${prettyCycle(entry.cycle)}`);
    }
    throw new Error("Circular dependencies detected in releasable unit.");
  }

  console.info("Dependency cycle gate passed.");
}

export async function main() {
  await checkDependencyCycles();
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
