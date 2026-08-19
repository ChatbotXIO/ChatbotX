"use client"

import type { DynamicImageImageElement } from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { DirectUploadButton } from "@chatbotx.io/ui/components/uploader/direct-upload-button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { ImageIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { useForm, useWatch } from "react-hook-form"
import { useCustomFieldSelectOptions } from "@/features/custom-fields/provider/custom-field-hook"
import type { DynamicImageElementPatch } from "../types"

type DynamicImageImageLayerPreviewProps = {
  element: DynamicImageImageElement
}

export function DynamicImageImageLayerPreview(
  props: DynamicImageImageLayerPreviewProps,
) {
  const { element } = props

  const shapeClassName = cn(
    "flex h-full w-full items-center justify-center overflow-hidden bg-muted text-muted-foreground",
    element.imageStyle === "circle" && "rounded-full",
  )

  if (element.imageType === "url" && element.url) {
    return (
      // biome-ignore lint/performance/noImgElement: canvas preview needs an arbitrary remote/blob URL, not a Next.js optimized asset
      <img
        alt=""
        className={cn(
          "h-full w-full object-contain",
          element.imageStyle === "circle" && "rounded-full",
        )}
        draggable={false}
        height={element.height}
        src={element.url}
        width={element.width}
      />
    )
  }

  return (
    <div className={shapeClassName}>
      <ImageIcon className="size-6" />
    </div>
  )
}

type DynamicImageImageLayerEditFormProps = {
  workspaceId: string
  element: DynamicImageImageElement
  onChange: (patch: Partial<DynamicImageImageElement>) => void
}

export function DynamicImageImageLayerEditForm(
  props: DynamicImageImageLayerEditFormProps,
) {
  const { workspaceId, element, onChange } = props
  const t = useTranslations()
  const customFieldOptions = useCustomFieldSelectOptions()

  const form = useForm<DynamicImageImageElement>({
    defaultValues: element,
    mode: "onChange",
  })
  const imageType = useWatch({ control: form.control, name: "imageType" })

  useEffect(() => {
    const subscription = form.watch((values) => {
      onChange(values as DynamicImageElementPatch)
    })
    return () => subscription.unsubscribe()
  }, [form, onChange])

  return (
    <Form {...form}>
      <div className="flex flex-col gap-4">
        <SelectField
          label={t("dynamicImages.editor.imageType")}
          name="imageType"
          options={[
            { value: "url", label: t("dynamicImages.editor.imageTypeUrl") },
            {
              value: "avatarUser",
              label: t("dynamicImages.editor.imageTypeAvatarUser"),
            },
            {
              value: "customField",
              label: t("dynamicImages.editor.imageTypeCustomField"),
            },
          ]}
        />

        {imageType === "url" ? (
          <div className="flex flex-col gap-1.5">
            <InputField
              label={t("dynamicImages.editor.imageUrl")}
              name="url"
              placeholder="https://..."
            />
            <DirectUploadButton
              accept="image/*"
              label={t("dynamicImages.editor.uploadImage")}
              onUploadSuccess={(_filePath, _file, publicUrl) =>
                form.setValue("url", publicUrl, { shouldDirty: true })
              }
              uploadPath={`dynamic-images/${workspaceId}/uploads`}
              workspaceId={workspaceId}
            />
          </div>
        ) : null}

        {imageType === "customField" ? (
          <ComboboxField
            emptyText={t("actions.noRecordFound")}
            label={t("dynamicImages.editor.customField")}
            name="customFieldId"
            options={customFieldOptions}
            placeholder={t("actions.pleaseSelect")}
          />
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <InputNumberField
            label={t("dynamicImages.editor.width")}
            min={1}
            name="width"
          />
          <InputNumberField
            label={t("dynamicImages.editor.height")}
            min={1}
            name="height"
          />
        </div>

        <SelectField
          label={t("dynamicImages.editor.imageStyle")}
          name="imageStyle"
          options={[
            {
              value: "square",
              label: t("dynamicImages.editor.imageStyleSquare"),
            },
            {
              value: "circle",
              label: t("dynamicImages.editor.imageStyleCircle"),
            },
          ]}
        />

        <SwitchField
          formItemClassName="flex flex-row items-center justify-between"
          label={t("dynamicImages.editor.priority")}
          name="priority"
        />
      </div>
    </Form>
  )
}
