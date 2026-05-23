import { usePlatformSettings } from "@/features/platform"
import type { WorkspaceResource } from "./schema/resource"

export function useWorkspaceLogoUrl(
  workspace: WorkspaceResource,
): string | undefined {
  const { storageUrl } = usePlatformSettings()

  return workspace.logo
    ? new URL(workspace.logo, storageUrl).toString()
    : undefined
}
