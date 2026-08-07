"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { DirectUploadButton } from "@chatbotx.io/ui/components/uploader/direct-upload-button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useRef } from "react"
import { toast } from "sonner"

type AvatarUploadFieldProps = {
  previewUrl: string | undefined
  alt: string
  fallbackText: string
  uploadPath: string
  workspaceId?: string
  uploadLabel: string
  onUploaded: (path: string) => void
  shape: "circle" | "rounded"
}

export function AvatarUploadField({
  previewUrl,
  alt,
  fallbackText,
  uploadPath,
  workspaceId,
  uploadLabel,
  onUploaded,
  shape,
}: AvatarUploadFieldProps) {
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
        className={cn(
          "relative size-16",
          shape === "circle" && "rounded-full p-0",
        )}
        onClick={() => triggerRef.current?.click()}
        type="button"
        variant="ghost"
      >
        <Avatar
          className={cn("size-16", shape === "rounded" && "rounded-lg border")}
        >
          <AvatarImage alt={alt} src={previewUrl ?? ""} />
          <AvatarFallback className="text-sm">{fallbackText}</AvatarFallback>
        </Avatar>
      </Button>
    </>
  )
}
