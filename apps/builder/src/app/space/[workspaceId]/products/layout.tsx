import type { ReactNode } from "react"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"

// This layout and the grouped products layout both exist because route groups split URL-equivalent routes.

export default async function ProductsLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ workspaceId: string }>
}) {
  await resolveGuardedWorkspaceId(params, "ecommerce")

  return children
}
