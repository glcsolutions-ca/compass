import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WorkspacesRoute from "~/routes/app/workspaces/route";

const useLoaderDataMock = vi.hoisted(() => vi.fn());
const useActionDataMock = vi.hoisted(() => vi.fn());
const useNavigationMock = vi.hoisted(() => vi.fn());
const useOutletContextMock = vi.hoisted(() => vi.fn());

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    Form: (props: ComponentProps<"form">) => <form {...props} />,
    useLoaderData: useLoaderDataMock,
    useActionData: useActionDataMock,
    useNavigation: useNavigationMock,
    useOutletContext: useOutletContextMock
  };
});

function authContext(workspaces: Array<{ id: string; name: string; role: string }>) {
  return {
    auth: {
      workspaces: workspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        role: workspace.role,
        slug: workspace.name.toLowerCase().replace(/\s+/g, "-"),
        status: "active"
      }))
    }
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  useLoaderDataMock.mockReturnValue({
    error: null,
    notice: null,
    workspaceSlug: null
  });
  useActionDataMock.mockReturnValue(undefined);
  useNavigationMock.mockReturnValue({ formData: null });
  useOutletContextMock.mockReturnValue(authContext([{ id: "ws-1", name: "Acme", role: "admin" }]));
});

describe("workspaces route component", () => {
  it("renders workspace list and form sections", () => {
    render(<WorkspacesRoute />);

    expect(screen.getByText("Manage workspaces")).toBeTruthy();
    expect(screen.getByTestId("workspace-list")).toBeTruthy();
    expect(screen.getByText("Acme")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create workspace" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Join workspace" })).toBeTruthy();
  });

  it("renders empty-state, notices, errors, and busy labels from loader/action/navigation state", () => {
    const formData = new FormData();
    formData.set("intent", "create");
    useNavigationMock.mockReturnValue({ formData });
    useLoaderDataMock.mockReturnValue({
      error: "Forbidden",
      notice: "created",
      workspaceSlug: "acme"
    });
    useActionDataMock.mockReturnValue({
      intent: "create",
      error: "Slug already exists"
    });
    useOutletContextMock.mockReturnValue(authContext([]));

    render(<WorkspacesRoute />);

    expect(screen.getByText("Forbidden")).toBeTruthy();
    expect(screen.getByText("Workspace created: acme.")).toBeTruthy();
    expect(
      screen.getByText(/You have no workspace memberships yet\. Chat is still available/)
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Creating..." })).toBeTruthy();
    expect(screen.getByText("Slug already exists")).toBeTruthy();
  });
});
