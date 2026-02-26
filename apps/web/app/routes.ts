import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/root-redirect/route.tsx"),
  route("login", "routes/public/login/route.tsx"),
  route("", "routes/app/layout/route.tsx", [
    route("workspaces", "routes/app/workspaces/route.tsx"),
    route("t/:tenantSlug/chat", "routes/app/chat/route.tsx")
  ])
] satisfies RouteConfig;
