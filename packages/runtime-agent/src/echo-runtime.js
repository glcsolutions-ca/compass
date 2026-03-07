export const ECHO_RUNTIME_KIND = "echo";

export async function runEchoRuntime(input) {
  return {
    outputText: `echo:${input.text}`,
    runtime: {
      sessionIdentifier: input.sessionIdentifier,
      bootId: input.bootId,
      runtimeKind: ECHO_RUNTIME_KIND,
      pid: input.pid
    }
  };
}
