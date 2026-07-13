import { withBlockedOwnerGuard } from "@chatbotx.io/business"

export async function isBlockedWorkspace(
  workspaceId: string | undefined,
): Promise<boolean> {
  return (
    (await withBlockedOwnerGuard(workspaceId, async () => true)) === undefined
  )
}
