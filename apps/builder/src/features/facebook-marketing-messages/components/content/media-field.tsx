"use client"

import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useFormContext, useWatch } from "react-hook-form"
import { MediaLibraryOrInsertLink } from "@/components/media-library-or-insert-link"

/**
 * Meta's media template accepts only `image` or `video`.
 *
 * `MediaLibraryOrInsertLink` binds to `<parentName>.mode`, `.url` and `.id`,
 * which is exactly `mmMediaRefSchema`'s shape. The `attachmentId` it does not
 * touch is filled server-side at save time by `resolveContentAttachments`.
 */
export function MediaField({ name }: { name: string }) {
  const t = useTranslations()
  const { control } = useFormContext()
  const mediaType = useWatch({ control, name: `${name}.mediaType` }) as
    | "image"
    | "video"
    | undefined

  return (
    <div className="flex flex-col gap-3">
      <SelectField
        label={t("facebookMarketingMessages.fields.media")}
        name={`${name}.mediaType`}
        options={[
          {
            value: "image",
            label: t("facebookMarketingMessages.fields.image"),
          },
          {
            value: "video",
            label: t("facebookMarketingMessages.fields.video"),
          },
        ]}
        required
      />
      <MediaLibraryOrInsertLink
        fileType={mediaType ?? "image"}
        parentName={`${name}.media`}
      />
    </div>
  )
}
