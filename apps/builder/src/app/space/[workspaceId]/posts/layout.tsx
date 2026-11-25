import type { ReactNode } from "react"
import { PostsTabs } from "@/features/channel-posts/components/posts-tabs"
import { SocialPostsRealtimeSync } from "@/features/social-posts/components/social-posts-realtime-sync"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"

export default async function PostsLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = await resolveGuardedWorkspaceId(params, "broadcast")

  return (
    <div>
      <SocialPostsRealtimeSync />
      <PostsTabs workspaceId={workspaceId} />
      {children}
    </div>
  )
}
