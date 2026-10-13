"use client"

import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { DirectUploadButton } from "@chatbotx.io/ui/components/uploader/direct-upload-button"
import { ImageIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useRef } from "react"
import { toast } from "sonner"
import type { LeaderboardWizardInput } from "../../lib/wizard-schema"

const MAX_COVER_BYTES = 5 * 1024 * 1024
const COVER_MIME_TYPES = "image/jpeg,image/png"

/** Cover banner: JPG/PNG up to 5MB, stored as its public URL in `coverImageUrl`. */
export function CoverImageField({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations()
  const triggerRef = useRef<HTMLButtonElement | null>(null)

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
            <DirectUploadButton
              accept={COVER_MIME_TYPES}
              className="hidden"
              label={t("actions.uploadFile")}
              maxSize={MAX_COVER_BYTES}
              multiple={false}
              onFileReject={() =>
                toast.error(t("leaderboards.wizard.coverImageRejected"))
              }
              onUploadError={() =>
                toast.error(t("leaderboards.wizard.coverImageRejected"))
              }
              onUploadSuccess={(_path, _file, publicUrl) =>
                field.onChange(publicUrl)
              }
              triggerRef={triggerRef}
              uploadPath={`public/space/${workspaceId}/leaderboards`}
              workspaceId={workspaceId}
            />
            <div className="relative flex aspect-[1200/630] w-full max-w-md items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/40">
              {url ? (
                // biome-ignore lint/performance/noImgElement: uploaded banner of any host, previewed as-is
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
              <Button
                onClick={() => triggerRef.current?.click()}
                size="sm"
                type="button"
                variant="outline"
              >
                <UploadIcon />
                {t("actions.uploadFile")}
              </Button>
              {url ? (
                <Button
                  onClick={() => field.onChange("")}
                  size="sm"
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
