"use client"

import { useRouter } from "next/navigation"
import { AddInstagramDialog } from "./add-instagram-dialog"

type InstagramLoginSelectProps = {
  workspaceId?: string | null
}

export function InstagramLoginSelect({
  workspaceId,
}: InstagramLoginSelectProps) {
  const router = useRouter()

  return (
    <AddInstagramDialog
      onOpenChange={(open) => {
        if (!open) {
          router.back()
        }
      }}
      open={true}
      workspaceId={workspaceId}
    />
  )
}
