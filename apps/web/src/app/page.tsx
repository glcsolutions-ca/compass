import HomeClient from "./home-client";

export const dynamic = "force-dynamic";

function resolveApiBaseUrl() {
  return (
    process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001"
  );
}

function resolveBearerToken() {
  return (
    process.env.BEARER_TOKEN ??
    process.env.NEXT_PUBLIC_BEARER_TOKEN ??
    process.env.NEXT_PUBLIC_DEV_BEARER_TOKEN
  );
}

export default function HomePage() {
  return <HomeClient baseUrl={resolveApiBaseUrl()} defaultToken={resolveBearerToken()} />;
}
