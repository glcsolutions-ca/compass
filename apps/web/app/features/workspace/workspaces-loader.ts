export interface WorkspacesLoaderData {
  error: string | null;
}

export async function loadWorkspacesData({
  request
}: {
  request: Request;
}): Promise<WorkspacesLoaderData> {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");

  return {
    error: error && error.trim().length > 0 ? error.trim() : null
  };
}
