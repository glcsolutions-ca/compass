function summarizeTokenError(payload, fallbackText) {
  if (payload && typeof payload === "object") {
    const error = typeof payload.error === "string" ? payload.error : "";
    const description =
      typeof payload.error_description === "string" ? payload.error_description : "";
    const summary = [error, description].filter((value) => value.length > 0).join(": ");
    if (summary.length > 0) {
      return summary;
    }
  }

  const snippet = fallbackText.trim().slice(0, 300);
  return snippet.length > 0 ? snippet : "No error payload returned";
}

export async function fetchClientCredentialsToken({ tenantId, clientId, clientSecret, scope }) {
  if (!tenantId || !clientId || !clientSecret || !scope) {
    throw new Error("tenantId, clientId, clientSecret, and scope are required");
  }

  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });

  const responseText = await response.text();
  let payload = null;
  try {
    payload = responseText.length > 0 ? JSON.parse(responseText) : null;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.access_token) {
    const reason = summarizeTokenError(payload, responseText);
    throw new Error(
      `Failed to acquire app token from tenant ${tenantId} (status ${response.status}): ${reason}`
    );
  }

  return payload.access_token;
}
