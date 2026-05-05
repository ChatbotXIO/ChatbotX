"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { createId } from "@chatbotx.io/utils"
import { Trash2Icon } from "lucide-react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { DirectUploadOrInsertLink } from "@/components/direct-upload"
import type { CreateProductRequest } from "../schema/action"

type Props = {
  workspaceId: string
}

function ImageThumbnail({
  index,
  onRemove,
}: {
  index: number
  onRemove: () => void
}) {
  const { control } = useFormContext<CreateProductRequest>()
  const url = useWatch({ control, name: `images.${index}.url` }) as
    | string
    | undefined

  if (!url) {
    return null
  }

  return (
    <div className="group relative size-20 shrink-0 overflow-hidden rounded-lg border bg-muted">
      <Image
        alt={`product-image-${index}`}
        className="object-cover"
        fill
        sizes="80px"
        src={url}
      />
      <Button
        className="absolute top-1 right-1 size-5 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={onRemove}
        size="icon"
        type="button"
        variant="destructive"
      >
        <Trash2Icon className="size-3" />
      </Button>
    </div>
  )
}

export function ProductImagesSection({ workspaceId }: Props) {
  const t = useTranslations()
  const { control } = useFormContext<CreateProductRequest>()

  const { fields, append, remove } = useFieldArray({
    control,
    name: "images",
  })

  const lastIndex = fields.length - 1
  const lastUrl = useWatch({
    control,
    name: lastIndex >= 0 ? `images.${lastIndex}.url` : "images",
  }) as string | undefined

  useEffect(() => {
    if (lastUrl) {
      append({ id: createId(), mode: "file", url: "" })
    }
  }, [lastUrl, append])

  const uploadIndex = lastUrl ? fields.length : Math.max(lastIndex, 0)
  const uploadIsInBounds = fields.length === 0 || uploadIndex < fields.length
  const uploadParentName =
    fields.length === 0 ? "images.0" : `images.${uploadIndex}`

  const uploadedFields = fields.filter((_, i) => {
    if (i === uploadIndex) {
      return false
    }
    return true
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("products.sections.images")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {uploadedFields.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {fields.map((field, index) => {
              if (index === uploadIndex) {
                return null
              }
              return (
                <ImageThumbnail
                  index={index}
                  key={field.id}
                  onRemove={() => remove(index)}
                />
              )
            })}
          </div>
        )}

        {uploadIsInBounds && (
          <div className="flex justify-center rounded-lg border bg-muted/40 p-4">
            <div className="w-full max-w-xs">
              <DirectUploadOrInsertLink
                fileType="image"
                key={uploadParentName}
                parentName={uploadParentName}
                uploadPath={`public/space/${workspaceId}/products/images`}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
