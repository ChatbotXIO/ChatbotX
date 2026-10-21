import type { ReactNode } from "react"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"

export default async function EcommerceSettingsLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ workspaceId: string }>
}) {
  await resolveGuardedWorkspaceId(params, "ecommerce")

  return children
}
