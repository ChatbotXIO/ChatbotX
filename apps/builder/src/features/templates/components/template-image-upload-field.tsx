"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { DirectUploadButton } from "@chatbotx.io/ui/components/uploader/direct-upload-button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { ImageIcon } from "lucide-react"
import { useRef } from "react"
import { toast } from "sonner"

type TemplateImageUploadFieldProps = {
  previewUrl: string | undefined
  uploadPath: string
  workspaceId: string
  uploadLabel: string
  onUploaded: (path: string) => void
}

export function TemplateImageUploadField({
  previewUrl,
  uploadPath,
  workspaceId,
  uploadLabel,
  onUploaded,
}: TemplateImageUploadFieldProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  return (
    <>
      <DirectUploadButton
        accept="image/*"
        className="hidden"
        label={uploadLabel}
        maxSize={10_485_760}
        multiple={false}
        onUploadError={(error) => {
          toast.error(error.message)
        }}
        onUploadSuccess={(filePath) => {
          onUploaded(filePath)
        }}
        triggerRef={triggerRef}
        uploadPath={uploadPath}
        workspaceId={workspaceId}
      />
      <Button
        className="relative aspect-video h-auto w-full max-w-md overflow-hidden rounded-lg border p-0"
        onClick={() => triggerRef.current?.click()}
        type="button"
        variant="ghost"
      >
        {previewUrl ? (
          // biome-ignore lint/performance/noImgElement: previews an uploaded file whose final render is a server-resolved public URL
          <img
            alt=""
            className={cn("size-full object-cover")}
            height={720}
            src={previewUrl}
            width={1280}
          />
        ) : (
          <ImageIcon className="size-8 text-muted-foreground" />
        )}
      </Button>
    </>
  )
}
