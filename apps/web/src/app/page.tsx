import HomeClient from "./home-client";

export const dynamic = "force-dynamic";

function resolveApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3001";
}

function resolveBearerToken() {
  return process.env.BEARER_TOKEN;
}

export default function HomePage() {
  return <HomeClient baseUrl={resolveApiBaseUrl()} defaultToken={resolveBearerToken()} />;
}
