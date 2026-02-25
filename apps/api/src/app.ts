import cors from "cors";
import express, { type ErrorRequestHandler, type Express } from "express";
import { buildOpenApiDocument } from "@compass/contracts";

interface JsonParseError extends Error {
  status?: number;
  type?: string;
}

function isMalformedJsonError(error: unknown): error is JsonParseError {
  if (!(error instanceof SyntaxError)) {
    return false;
  }

  const parseError = error as JsonParseError;
  return parseError.status === 400 && parseError.type === "entity.parse.failed";
}

export function buildApiApp(now: () => Date = () => new Date()): Express {
  const app = express();
  app.disable("x-powered-by");
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

  app.use((_req, res) => {
    res.status(404).json({
      code: "NOT_FOUND",
      message: "Route not found"
    });
  });

  const malformedJsonHandler: ErrorRequestHandler = (error, _req, res, next) => {
    if (!isMalformedJsonError(error)) {
      next(error);
      return;
    }

    res.status(400).json({
      code: "INVALID_JSON",
      message: "Malformed JSON request body"
    });
  };
  app.use(malformedJsonHandler);

  const defaultErrorHandler: ErrorRequestHandler = (_error, _req, res, _next) => {
    res.status(500).json({
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected server error"
    });
  };
  app.use(defaultErrorHandler);

  return app;
}
