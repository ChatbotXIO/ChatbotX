import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"

// This layout and the grouped sequences layout both exist because route groups split URL-equivalent routes.

export default async function SequencesLayout({
  children,
  params,
}: {
  params: Promise<{ workspaceId: string }>
  children: React.ReactNode
}) {
  await resolveGuardedWorkspaceId(params, "broadcast")

  return <FlowStoreProvider>{children}</FlowStoreProvider>
}
