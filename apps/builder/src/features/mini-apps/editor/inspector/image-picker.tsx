"use client"

import { MINI_APP_MAX_IMAGE_BASE64_LENGTH } from "@chatbotx.io/mini-app"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { ImagePlusIcon, Loader2Icon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { MediaLibraryTrigger } from "@/features/media-library/components/media-library-trigger"
import { useWorkspaceId } from "@/hooks/routing"
import { loadMediaLibraryImageAction } from "../../actions/load-media-library-image.action"
import { toImageSrc } from "../../lib/image-src"
import { base64ToFile, imageFileToBase64 } from "../../lib/image-to-base64"
import type { MiniAppPropertyKey } from "../../lib/labels"
import { readString } from "../../lib/props"
import { FieldRow, useInspector } from "./field-row"

/**
 * Picks an image from the workspace media library (where new images can also
 * be uploaded), then shrinks it in the browser to fit inline in Flow JSON.
 */
export function ImagePicker({
  value,
  maxLength,
  onChange,
}: {
  value?: string
  maxLength: number
  onChange: (base64: string | undefined) => void
}) {
  const t = useTranslations("miniApps.inspector")
  const workspaceId = useWorkspaceId()
  const src = toImageSrc(value)
  const { executeAsync, isPending } = useAction(
    loadMediaLibraryImageAction.bind(null, workspaceId),
  )

  const applyLibraryImage = async (fileId: string) => {
    const result = await executeAsync({ fileId })
    if (!result?.data) {
      toast.error(result?.serverError ?? t("imageLoadFailed"))
      return
    }
    const base64 = await imageFileToBase64(
      base64ToFile(result.data.base64, result.data.mimeType),
      maxLength,
    )
    if (base64) {
      onChange(base64)
    } else {
      toast.error(t("imageTooLarge"))
    }
  }

  return (
    <div className="flex items-center gap-2">
      {src ? (
        // biome-ignore lint/performance/noImgElement: inline base64 preview
        <img
          alt=""
          className="size-12 rounded border object-cover"
          height={48}
          src={src}
          width={48}
        />
      ) : null}
      <MediaLibraryTrigger
        onSelect={(file) => {
          applyLibraryImage(file.id).catch(() =>
            toast.error(t("imageLoadFailed")),
          )
        }}
        workspaceId={workspaceId}
      >
        <Button disabled={isPending} size="sm" type="button" variant="outline">
          {isPending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <ImagePlusIcon className="size-4" />
          )}
          {t("uploadImage")}
        </Button>
      </MediaLibraryTrigger>
      {value ? (
        <Button
          onClick={() => onChange(undefined)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <XIcon className="size-4" />
        </Button>
      ) : null}
    </div>
  )
}

export function ImageProp({
  propKey = "src",
}: {
  propKey?: MiniAppPropertyKey
}) {
  const { props, setProp } = useInspector()
  return (
    <FieldRow propKey={propKey}>
      <ImagePicker
        maxLength={MINI_APP_MAX_IMAGE_BASE64_LENGTH}
        onChange={(base64) => setProp(propKey, base64)}
        value={readString(props[propKey]) || undefined}
      />
    </FieldRow>
  )
}
