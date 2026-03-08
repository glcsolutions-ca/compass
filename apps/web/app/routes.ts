import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/root-redirect/route.tsx"),
  route("login", "routes/public/login/route.tsx"),
  route("workspaces", "routes/app/workspaces/route.tsx"),
  route("", "routes/app/layout/route.tsx", [
    route("chat", "routes/app/chat/route.tsx"),
    route("chat/:threadHandle", "routes/app/chat-path-legacy/route.tsx"),
    route("c/:threadHandle", "routes/app/conversation/route.tsx"),
    route("w/:workspaceSlug/chat/:threadId?", "routes/app/chat-legacy/route.tsx"),
    route("w/:workspaceSlug/settings", "routes/app/settings-legacy/route.tsx"),
    route("w/:workspaceSlug/skills", "routes/app/skills-legacy/route.tsx"),
    route("w/:workspaceSlug/automations", "routes/app/automations-legacy/route.tsx"),
    route("workspaces/:workspaceSlug/settings", "routes/app/settings/route.tsx"),
    route("workspaces/:workspaceSlug/skills", "routes/app/skills/route.tsx"),
    route("workspaces/:workspaceSlug/automations", "routes/app/automations/route.tsx")
  ])
] satisfies RouteConfig;
