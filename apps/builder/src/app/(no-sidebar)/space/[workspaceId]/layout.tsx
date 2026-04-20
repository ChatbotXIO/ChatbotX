import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound, redirect } from "next/navigation"
import type { ReactNode } from "react"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { logger } from "@/lib/log"

export type WorkspaceNoSidebarLayoutProps = {
  params: Promise<{ workspaceId: string }>
  children: ReactNode
}

export default async function WorkspaceNoSidebarLayout({
  params,
  children,
}: WorkspaceNoSidebarLayoutProps) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const result = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!result) {
    logger.debug(
      `User is not authenticated or does not have access to the workspace ${workspaceId}`,
    )

    return redirect("/")
  }

  return children
}
