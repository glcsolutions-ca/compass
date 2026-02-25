import cors from "cors";
import express, { type Express } from "express";
import { buildOpenApiDocument } from "@compass/contracts";

export function buildApiApp(now: () => Date = () => new Date()): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const openapi = buildOpenApiDocument();

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      timestamp: now().toISOString()
    });
  });

  app.get("/openapi.json", (_req, res) => {
    res.status(200).json(openapi);
  });

  app.get("/v1/ping", (_req, res) => {
    res.status(200).json({
      ok: true,
      service: "api"
    });
  });

  return app;
}
