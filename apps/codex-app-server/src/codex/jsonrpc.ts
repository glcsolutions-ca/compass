export type JsonRpcId = string | number;

export interface JsonRpcRequest {
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  id: JsonRpcId;
  result: unknown;
}

export interface JsonRpcErrorShape {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcError {
  id: JsonRpcId | null;
  error: JsonRpcErrorShape;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse | JsonRpcError;

export class CodexRpcError extends Error {
  readonly code: number;
  readonly data: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "CodexRpcError";
    this.code = code;
    this.data = data;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!isObject(value)) {
    return false;
  }
  return (
    (typeof value.id === "string" || typeof value.id === "number") &&
    typeof value.method === "string"
  );
}

export function isJsonRpcNotification(value: unknown): value is JsonRpcNotification {
  if (!isObject(value)) {
    return false;
  }
  return value.id === undefined && typeof value.method === "string";
}

export function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  if (!isObject(value)) {
    return false;
  }
  return (
    (typeof value.id === "string" || typeof value.id === "number") &&
    "result" in value &&
    !("error" in value)
  );
}

export function isJsonRpcError(value: unknown): value is JsonRpcError {
  if (!isObject(value)) {
    return false;
  }

  const error = value.error;
  if (!isObject(error)) {
    return false;
  }

  return (
    (value.id === null || typeof value.id === "string" || typeof value.id === "number") &&
    typeof error.code === "number" &&
    typeof error.message === "string"
  );
}
