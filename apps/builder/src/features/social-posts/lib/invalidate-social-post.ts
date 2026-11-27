import type { QueryClient } from "@tanstack/react-query"
import { orpc } from "@/lib/orpc/query"
import { socialPostListQueryKeys } from "./social-post-query-keys"

/** Refreshes the Posts list, its counts and one post's detail after a change to it. */
export const invalidateSocialPost = async (
  queryClient: QueryClient,
  workspaceId: string,
  id: string,
): Promise<void> => {
  await Promise.all([
    ...socialPostListQueryKeys().map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
    queryClient.invalidateQueries({
      queryKey: orpc.socialPostsAPIs.privateGetSocialPostAPI.key({
        input: { id, workspaceId },
      }),
    }),
  ])
}
