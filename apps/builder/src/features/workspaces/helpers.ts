import { env } from "@/env"
import type { WorkspaceResource } from "./schema/resource"

export function getChatbotLogoUrl(workspace: WorkspaceResource) {
  return workspace.logo
    ? new URL(workspace.logo, env.NEXT_PUBLIC_ASSET_URL).toString()
    : undefined
}
