export function getScriptArgs(argv = process.argv.slice(2)) {
  return argv[0] === "--" ? argv.slice(1) : argv;
}
