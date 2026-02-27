import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/root-redirect/route.tsx"),
  route("login", "routes/public/login/route.tsx"),
  route("", "routes/app/layout/route.tsx", [
    route("automations", "routes/app/automations/route.tsx"),
    route("skills", "routes/app/skills/route.tsx"),
    route("chat/:threadId?", "routes/app/chat/route.tsx"),
    route("workspaces", "routes/app/workspaces/route.tsx")
  ])
] satisfies RouteConfig;
