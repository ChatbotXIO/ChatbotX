import { useTenantSettings } from "@/features/tenant"
import type { WorkspaceResource } from "./schema/resource"

export function useWorkspaceLogoUrl(
  workspace: Pick<WorkspaceResource, "logo"> | null | undefined,
): string | undefined {
  const { storageUrl } = useTenantSettings()

  return getWorkspaceLogoUrl(workspace, storageUrl)
}

export function getWorkspaceLogoUrl(
  workspace: Pick<WorkspaceResource, "logo"> | null | undefined,
  storageUrl: string,
): string | undefined {
  return workspace?.logo
    ? new URL(workspace.logo, storageUrl).toString()
    : undefined
}
