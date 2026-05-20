"use client"

import type { ImportType, UploadTypes } from "@chatbotx.io/database/partials"
import { useCallback } from "react"

export type UploadResult = {
  fileId: string
  fileName: string
  fileSize: number
  mimeType: string
}

export function usePresignedUpload(
  workspaceId: string,
  type: UploadTypes,
  subType: ImportType,
) {
  const upload = useCallback(
    async (file: File): Promise<UploadResult> => {
      const mimeType = file.type || "text/csv"

      const presignResponse = await fetch("/api/presigned-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          subType,
          workspaceId,
          fileName: file.name,
          mimeType,
        }),
      })
      if (!presignResponse.ok) {
        throw new Error("Presign failed")
      }
      const { fileId, presignedPostUrl } = (await presignResponse.json()) as {
        fileId: string
        presignedPostUrl: string
      }

      const uploadResponse = await fetch(presignedPostUrl, {
        method: "PUT",
        body: file,
      })
      if (!uploadResponse.ok) {
        throw new Error("Upload failed")
      }

      return {
        fileId,
        fileName: file.name,
        fileSize: file.size,
        mimeType,
      }
    },
    [workspaceId, type, subType],
  )

  return { upload }
}
