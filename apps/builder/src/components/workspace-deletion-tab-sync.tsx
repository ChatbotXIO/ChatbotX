"use client"

import { usePathname } from "next/navigation"
import { useEffect } from "react"
import {
  clearWorkspaceDeletionSync,
  parseWorkspaceDeletionPayload,
  WORKSPACE_DELETION_SYNC_KEY,
  writeWorkspaceDeletionSync,
} from "@/lib/workspace/deletion-tab-sync"
import { workspaceSettingsGeneralPath } from "@/lib/workspace/settings-paths"

export function WorkspaceDeletionTabSync({
  workspaceId,
  scheduledForDeletion,
}: {
  workspaceId: string
  scheduledForDeletion: boolean
}) {
  const pathname = usePathname()

  useEffect(() => {
    const targetPath = workspaceSettingsGeneralPath(workspaceId)

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== WORKSPACE_DELETION_SYNC_KEY) {
        return
      }

      const payload = parseWorkspaceDeletionPayload(event.newValue)
      if (payload?.workspaceId !== workspaceId) {
        return
      }

      if (window.location.pathname.startsWith(targetPath)) {
        return
      }

      window.location.assign(targetPath)
    }

    window.addEventListener("storage", handleStorage)
    return () => window.removeEventListener("storage", handleStorage)
  }, [workspaceId])

  useEffect(() => {
    if (scheduledForDeletion) {
      writeWorkspaceDeletionSync(workspaceId)
    } else {
      clearWorkspaceDeletionSync(workspaceId)
    }
  }, [workspaceId, scheduledForDeletion])

  useEffect(() => {
    if (!scheduledForDeletion) {
      return
    }

    const targetPath = workspaceSettingsGeneralPath(workspaceId)
    if (!pathname.startsWith(targetPath)) {
      window.location.assign(targetPath)
    }
  }, [pathname, scheduledForDeletion, workspaceId])

  return null
}
