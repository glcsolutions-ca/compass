import type { SystemRoutesContext } from "./route-context.js";

export function registerSystemRoutes(input: SystemRoutesContext): void {
  input.app.get("/health", (_request, response) => {
    response.status(200).json({
      status: "ok",
      timestamp: input.now().toISOString()
    });
  });

  input.app.get("/openapi.json", (_request, response) => {
    response.status(200).json(input.openapi);
  });

  input.app.get("/v1/ping", (_request, response) => {
    response.status(200).json({
      ok: true,
      service: "api"
    });
  });
}
