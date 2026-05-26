"use client"

import type { ImportType, UploadTypes } from "@chatbotx.io/database/partials"
import { getImportEntry } from "@chatbotx.io/imports"
import { extractCsvHeaders } from "@chatbotx.io/imports/parsers/headers"
import { Card } from "@chatbotx.io/ui/components/ui/card"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import FileDropzone from "@/components/file-dropzone"
import {
  type UploadResult,
  usePresignedUpload,
} from "../hooks/use-presigned-upload"

type ImportDropzoneProps = {
  workspaceId: string
  type: UploadTypes
  subType: ImportType
  onUploaded: (result: UploadResult, csvHeaders: string[]) => void
  onCleared: () => void
  onUploadingChange?: (isUploading: boolean) => void
}

const noop = () => undefined

export function ImportDropzone({
  workspaceId,
  type,
  subType,
  onUploaded,
  onCleared,
  onUploadingChange,
}: ImportDropzoneProps) {
  const t = useTranslations()
  const { upload } = usePresignedUpload(workspaceId, type, subType)
  const [isUploading, setIsUploading] = useState(false)
  const config = getImportEntry(subType).config
  const maxBytes = config.maxFileSizeMB * 1024 * 1024

  const handleDrop = async (file: File) => {
    if (file.size > maxBytes) {
      toast.error(
        `File exceeds ${config.maxFileSizeMB}MB limit for ${subType} import`,
      )
      return
    }
    if (!config.acceptedMimeTypes.includes(file.type || "text/csv")) {
      toast.error(`Unsupported file type for ${subType} import`)
      return
    }
    setIsUploading(true)
    onUploadingChange?.(true)
    try {
      const headers = await extractCsvHeaders(file)
      const result = await upload(file)
      onUploaded(result, headers)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload error")
    } finally {
      setIsUploading(false)
      onUploadingChange?.(false)
    }
  }

  return (
    <Card className="border-dashed">
      <FileDropzone
        configs={{
          uploadKeyName: "actions.uploadDocument",
          accept: config.acceptedExtensions,
          maxSize: config.maxFileSizeMB,
          isCard: true,
        }}
        mode="file"
        onDrop={(file: File) => {
          handleDrop(file).catch(() => undefined)
        }}
        onRemove={onCleared}
        parentName="file"
        register={noop}
        type="file"
        unregister={noop}
      />
      {isUploading && (
        <div className="px-4 pb-2 text-muted-foreground text-xs">
          {t("fields.import.uploading")}
        </div>
      )}
    </Card>
  )
}
