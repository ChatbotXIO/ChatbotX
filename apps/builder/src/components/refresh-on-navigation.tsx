"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { readWorkspaceDeletionSync } from "@/lib/workspace/deletion-tab-sync"
import { workspaceSettingsGeneralPath } from "@/lib/workspace/settings-paths"

export function RefreshOnNavigation({ workspaceId }: { workspaceId: string }) {
  const router = useRouter()

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const deletionSync = readWorkspaceDeletionSync()
        const targetPath = workspaceSettingsGeneralPath(workspaceId)
        if (
          deletionSync?.workspaceId === workspaceId &&
          !window.location.pathname.startsWith(targetPath)
        ) {
          window.location.assign(targetPath)
          return
        }

        router.refresh()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [router, workspaceId])

  return null
}
