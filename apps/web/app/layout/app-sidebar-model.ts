import {
  Boxes,
  Clock3,
  FolderKanban,
  type LucideIcon,
  MessageSquareText,
  SquarePen
} from "lucide-react";
import { buildNewThreadHref } from "~/features/chat/new-thread-routing";
import {
  buildWorkspaceAutomationsHref,
  buildWorkspaceSkillsHref
} from "~/lib/routes/workspace-routes";

export interface SidebarNavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  active: boolean;
}

export function readInitials(value: string): string {
  const segments = value
    .trim()
    .split(/\s+/u)
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return "CP";
  }

  return segments
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() ?? "")
    .join("");
}

export function buildUtilityItems(input: {
  defaultWorkspaceSlug: string;
  pathname: string;
}): SidebarNavItem[] {
  const newThreadHref = input.defaultWorkspaceSlug
    ? buildNewThreadHref({ workspaceSlug: input.defaultWorkspaceSlug })
    : "/chat";

  return [
    {
      label: "New thread",
      to: newThreadHref,
      icon: SquarePen,
      active: false
    },
    {
      label: "Automations",
      to: input.defaultWorkspaceSlug
        ? buildWorkspaceAutomationsHref(input.defaultWorkspaceSlug)
        : "/workspaces",
      icon: Clock3,
      active: /^\/workspaces\/[^/]+\/automations(?:\/|$)/u.test(input.pathname)
    },
    {
      label: "Skills",
      to: input.defaultWorkspaceSlug
        ? buildWorkspaceSkillsHref(input.defaultWorkspaceSlug)
        : "/workspaces",
      icon: Boxes,
      active: /^\/workspaces\/[^/]+\/skills(?:\/|$)/u.test(input.pathname)
    }
  ];
}

export function buildPrimaryItems(input: {
  defaultWorkspaceSlug: string;
  pathname: string;
}): SidebarNavItem[] {
  return [
    {
      label: "Chat",
      to: "/chat",
      icon: MessageSquareText,
      active: input.pathname === "/chat" || /^\/chat\/[^/]+/u.test(input.pathname)
    },
    {
      label: "Workspaces",
      to: "/workspaces",
      icon: FolderKanban,
      active: input.pathname.startsWith("/workspaces")
    }
  ];
}
