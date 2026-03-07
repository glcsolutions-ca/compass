export interface WorkspacesLoaderData {
  error: string | null;
  notice: "created" | "joined" | null;
  workspaceSlug: string | null;
}

export async function loadWorkspacesData({
  request
}: {
  request: Request;
}): Promise<WorkspacesLoaderData> {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const noticeCandidate = url.searchParams.get("notice");
  const notice =
    noticeCandidate === "created" || noticeCandidate === "joined" ? noticeCandidate : null;
  const workspaceCandidate = url.searchParams.get("workspace");
  const workspaceSlug =
    workspaceCandidate && workspaceCandidate.trim().length > 0 ? workspaceCandidate.trim() : null;

  return {
    error: error && error.trim().length > 0 ? error.trim() : null,
    notice,
    workspaceSlug
  };
}
