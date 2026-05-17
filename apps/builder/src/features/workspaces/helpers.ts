import { usePlatformUrls } from "@/features/platform"
import type { WorkspaceResource } from "./schema/resource"

export function useWorkspaceLogoUrl(
  workspace: WorkspaceResource,
): string | undefined {
  const { assetUrl } = usePlatformUrls()

  return workspace.logo
    ? new URL(workspace.logo, assetUrl).toString()
    : undefined
}
