"use client"

import { fileTypes } from "@chatbotx.io/database/partials"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { useEffect } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { DirectUploadOrInsertLink } from "@/components/direct-upload"

/**
 * One image (a category's or a vendor's), drawn like the minigame
 * "Background image": a label, then a card holding the upload / media
 * library / insert-link control with its own preview.
 *
 * That control works on a `{ mode, url }` pair. The forms keep a plain URL
 * at `name`, so the pair lives at `<name>Upload` and its `url` is copied back
 * to `name` on every change.
 */
export function SingleImageField({
  name,
  label,
  uploadPath,
  description,
}: {
  name: string
  label: string
  uploadPath: string
  description?: string
}) {
  const { control, getValues, setValue } = useFormContext()
  const uploadName = `${name}Upload`
  const uploadedUrl = useWatch({ control, name: `${uploadName}.url` }) as
    | string
    | undefined

  // Seed the pair from the stored URL once, so an edit form shows the image.
  useEffect(() => {
    if (getValues(`${uploadName}.url`) === undefined) {
      setValue(uploadName, {
        mode: "file",
        url: (getValues(name) as string | null | undefined) ?? "",
      })
    }
  }, [getValues, name, setValue, uploadName])

  useEffect(() => {
    if (uploadedUrl !== undefined && uploadedUrl !== (getValues(name) ?? "")) {
      setValue(name, uploadedUrl, { shouldDirty: true, shouldValidate: true })
    }
  }, [getValues, name, setValue, uploadedUrl])

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Card>
        <CardContent>
          <DirectUploadOrInsertLink
            fileType={fileTypes.enum.image}
            parentName={uploadName}
            uploadPath={uploadPath}
            useMediaLibrary
          />
        </CardContent>
      </Card>
      {description ? (
        <p className="text-muted-foreground text-sm">{description}</p>
      ) : null}
    </div>
  )
}
