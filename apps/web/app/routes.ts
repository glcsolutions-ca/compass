import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/root-redirect/route.tsx"),
  route("login", "routes/public/login/route.tsx"),
  route("workspaces", "routes/app/workspaces/route.tsx"),
  route("", "routes/app/layout/route.tsx", [
    route("chat", "routes/app/chat/route.tsx"),
    route("chat/:threadHandle", "routes/app/chat-thread/route.tsx"),
    route("settings", "routes/app/settings/route.tsx"),
    route("settings/:section", "routes/app/settings-section/route.tsx"),
    route("workspaces/:workspaceSlug/skills", "routes/app/skills/route.tsx"),
    route("workspaces/:workspaceSlug/automations", "routes/app/automations/route.tsx")
  ])
] satisfies RouteConfig;
