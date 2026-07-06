import type { ReactNode } from "react"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"
import { SettingsTab } from "./tab"

type LayoutSettingProps = {
  children: ReactNode
  params: Promise<{ workspaceId: string }>
}

export default async function SettingLayout({
  children,
  params,
}: LayoutSettingProps) {
  await resolveGuardedWorkspaceId(params, "superAdmin")

  return (
    <>
      <SettingsTab />
      <div>{children}</div>
    </>
  )
}
