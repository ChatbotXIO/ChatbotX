"use client"

import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { ImageIcon, Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { MediaLibraryTrigger } from "@/features/media-library/components/media-library-trigger"
import type { LeaderboardWizardInput } from "../../lib/wizard-schema"

const MAX_COVER_BYTES = 5 * 1024 * 1024
const COVER_MIME_TYPES = new Set(["image/jpeg", "image/png"])

/**
 * Cover banner picked from the workspace Media Library (uploads happen
 * inside the library, never straight from this form). JPG/PNG up to 5MB,
 * stored as the file's public URL in `coverImageUrl`.
 */
export function CoverImageField({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations()

  return (
    <FormFieldWrapper<LeaderboardWizardInput>
      description={t("leaderboards.wizard.coverImageHint")}
      label={t("leaderboards.wizard.coverImage")}
      name="coverImageUrl"
    >
      {(field) => {
        const url = typeof field.value === "string" ? field.value : ""
        return (
          <div className="flex flex-col gap-2">
            <div className="relative flex aspect-[1200/630] w-full max-w-md items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/40">
              {url ? (
                // biome-ignore lint/performance/noImgElement: media library file of any host, previewed as-is
                <img
                  alt={t("leaderboards.wizard.coverImage")}
                  className="size-full object-cover"
                  height={630}
                  src={url}
                  width={1200}
                />
              ) : (
                <ImageIcon className="size-8 text-muted-foreground" />
              )}
            </div>
            <div className="flex gap-2">
              <MediaLibraryTrigger
                onSelect={(file) => {
                  if (
                    !COVER_MIME_TYPES.has(file.mimeType) ||
                    file.size > MAX_COVER_BYTES
                  ) {
                    toast.error(t("leaderboards.wizard.coverImageRejected"))
                    return
                  }
                  field.onChange(file.url)
                }}
                uploadPath={`public/space/${workspaceId}/leaderboards`}
                workspaceId={workspaceId}
              />
              {url ? (
                <Button
                  onClick={() => field.onChange("")}
                  type="button"
                  variant="ghost"
                >
                  <Trash2Icon />
                  {t("actions.remove")}
                </Button>
              ) : null}
            </div>
          </div>
        )
      }}
    </FormFieldWrapper>
  )
}
