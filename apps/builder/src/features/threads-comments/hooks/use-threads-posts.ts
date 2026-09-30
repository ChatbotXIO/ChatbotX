import { useQuery } from "@tanstack/react-query"
import { orpc } from "@/lib/orpc/query"

/**
 * Recent posts of the workspace's Threads accounts. Pass `enabled: false`
 * until the picker opens so opening the form does not hit the Threads API.
 */
export const useThreadsPosts = (
  workspaceId: string | undefined,
  options: { enabled: boolean },
) =>
  useQuery(
    orpc.threadsCommentsAPI.threadsPostsAPI.queryOptions({
      input: { workspaceId: workspaceId ?? "" },
      enabled: Boolean(workspaceId) && options.enabled,
    }),
  )
