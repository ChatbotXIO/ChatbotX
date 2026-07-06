import type { ReactNode } from "react"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"

export default async function BroadcastsLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ workspaceId: string }>
}) {
  await resolveGuardedWorkspaceId(params, "broadcast")

  return children
}
