import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/login.tsx"),
  route("login", "routes/login-alias.tsx"),
  route("workspaces", "routes/workspaces.tsx"),
  route("t/:tenantSlug/*", "routes/tenant.tsx")
] satisfies RouteConfig;
