import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"

export default async function PageAutomatedResponsesLayout({
  children,
  params,
}: {
  params: Promise<{ workspaceId: string }>
  children: React.ReactNode
}) {
  const workspaceId = await resolveGuardedWorkspaceId(params, "superAdmin")

  return (
    <FlowStoreProvider workspaceId={workspaceId}>{children}</FlowStoreProvider>
  )
}
