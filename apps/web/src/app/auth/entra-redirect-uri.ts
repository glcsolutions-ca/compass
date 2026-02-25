const ENTRA_CALLBACK_PATH = "/api/auth/entra/callback";

export interface EntraRedirectUriResolution {
  redirectUri: URL | null;
  error: string | null;
  code: string | null;
}

export function resolveEntraRedirectUri(webBaseUrl: string | null): EntraRedirectUriResolution {
  if (!webBaseUrl) {
    return {
      redirectUri: null,
      error: "WEB_BASE_URL is not configured",
      code: "WEB_BASE_URL_REQUIRED"
    };
  }

  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(webBaseUrl);
  } catch {
    return {
      redirectUri: null,
      error: "WEB_BASE_URL must be an absolute URL",
      code: "WEB_BASE_URL_INVALID"
    };
  }

  if (parsedBaseUrl.hostname === "0.0.0.0") {
    return {
      redirectUri: null,
      error: "WEB_BASE_URL must not use 0.0.0.0; use localhost",
      code: "WEB_BASE_URL_INVALID"
    };
  }

  const isHttps = parsedBaseUrl.protocol === "https:";
  const isHttpLocalhost =
    parsedBaseUrl.protocol === "http:" &&
    (parsedBaseUrl.hostname === "localhost" || parsedBaseUrl.hostname === "127.0.0.1");
  if (!isHttps && !isHttpLocalhost) {
    return {
      redirectUri: null,
      error: "WEB_BASE_URL must use https, or http only for localhost/127.0.0.1",
      code: "WEB_BASE_URL_INVALID"
    };
  }

  if (parsedBaseUrl.pathname !== "/" || parsedBaseUrl.search || parsedBaseUrl.hash) {
    return {
      redirectUri: null,
      error: "WEB_BASE_URL must not include path, query, or fragment",
      code: "WEB_BASE_URL_INVALID"
    };
  }

  const redirectUri = new URL(parsedBaseUrl.toString());
  redirectUri.pathname = ENTRA_CALLBACK_PATH;
  redirectUri.search = "";
  redirectUri.hash = "";

  return {
    redirectUri,
    error: null,
    code: null
  };
}
