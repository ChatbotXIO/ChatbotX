import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"

export default async function PageAutomatedResponsesLayout({
  children,
  params,
}: {
  params: Promise<{ workspaceId: string }>
  children: React.ReactNode
}) {
  await resolveGuardedWorkspaceId(params, "superAdmin")

  return children
}
