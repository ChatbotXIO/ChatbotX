import type { ReactNode } from "react"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { SettingsTab } from "./tab"

type LayoutSettingProps = {
  children: ReactNode
  params: Promise<{ workspaceId: string }>
}

export default async function SettingLayout({
  children,
  params,
}: LayoutSettingProps) {
  const workspaceId = await resolveGuardedWorkspaceId(params, "superAdmin")
  const result = await getCurrentUserAndTargetWorkspace(workspaceId)
  const scheduledForDeletion = Boolean(
    result?.targetWorkspace.scheduledDeletionAt,
  )

  return (
    <>
      <SettingsTab scheduledForDeletion={scheduledForDeletion} />
      <div>{children}</div>
    </>
  )
}
