import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/public.home/route.tsx"),
  route("login", "routes/public.login/route.tsx"),
  route("", "routes/app.root/route.tsx", [
    route("workspaces", "routes/app.workspaces/route.tsx"),
    route("t/:tenantSlug/chat", "routes/app.t.$tenantSlug.chat/route.tsx")
  ])
] satisfies RouteConfig;
