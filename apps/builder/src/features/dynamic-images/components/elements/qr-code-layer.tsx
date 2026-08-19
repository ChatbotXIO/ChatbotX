"use client"

import type { DynamicImageQrCodeElement } from "@chatbotx.io/database/partials"
import { ColorPickerField } from "@chatbotx.io/ui/components/form/color-picker-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { DirectUploadButton } from "@chatbotx.io/ui/components/uploader/direct-upload-button"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import QRCode from "react-qr-code"
import { DynamicImageVariableTextField } from "../plain-text-variable-field"
import type { DynamicImageElementPatch } from "../types"

const QR_CODE_MIN_SIZE = 64
const QR_CODE_MAX_SIZE = 1024

type DynamicImageQrCodeLayerPreviewProps = {
  element: DynamicImageQrCodeElement
}

export function DynamicImageQrCodeLayerPreview(
  props: DynamicImageQrCodeLayerPreviewProps,
) {
  const { element } = props

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-white p-1">
      <QRCode
        fgColor={element.color}
        style={{ height: "100%", maxWidth: "100%", width: "100%" }}
        value={element.text || " "}
      />
      {element.logoUrl ? (
        // biome-ignore lint/performance/noImgElement: canvas preview needs an arbitrary remote/blob URL, not a Next.js optimized asset
        <img
          alt=""
          className="absolute size-1/4 rounded bg-white object-contain p-0.5"
          draggable={false}
          height={64}
          src={element.logoUrl}
          width={64}
        />
      ) : null}
    </div>
  )
}

type DynamicImageQrCodeLayerEditFormProps = {
  workspaceId: string
  element: DynamicImageQrCodeElement
  onChange: (patch: Partial<DynamicImageQrCodeElement>) => void
}

export function DynamicImageQrCodeLayerEditForm(
  props: DynamicImageQrCodeLayerEditFormProps,
) {
  const { workspaceId, element, onChange } = props
  const t = useTranslations()

  const form = useForm<DynamicImageQrCodeElement>({
    defaultValues: element,
    mode: "onChange",
  })

  useEffect(() => {
    const subscription = form.watch((values) => {
      onChange(values as DynamicImageElementPatch)
    })
    return () => subscription.unsubscribe()
  }, [form, onChange])

  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      if (name !== "size" || values.size === undefined) {
        return
      }
      form.setValue("width", values.size, { shouldDirty: true })
      form.setValue("height", values.size, { shouldDirty: true })
    })
    return () => subscription.unsubscribe()
  }, [form])

  return (
    <Form {...form}>
      <div className="flex flex-col gap-4">
        <Controller
          control={form.control}
          name="text"
          render={({ field }) => (
            <DynamicImageVariableTextField
              label={t("dynamicImages.editor.qrText")}
              onChange={field.onChange}
              value={field.value}
            />
          )}
        />

        <InputNumberField
          label={t("dynamicImages.editor.qrSize")}
          max={QR_CODE_MAX_SIZE}
          min={QR_CODE_MIN_SIZE}
          name="size"
        />

        <ColorPickerField
          label={t("dynamicImages.editor.qrColor")}
          name="color"
        />

        <div className="flex flex-col gap-1.5">
          <Label>{t("dynamicImages.editor.qrLogo")}</Label>
          <DirectUploadButton
            accept="image/*"
            label={t("dynamicImages.editor.uploadLogo")}
            onUploadSuccess={(_filePath, _file, publicUrl) =>
              form.setValue("logoUrl", publicUrl, { shouldDirty: true })
            }
            uploadPath={`dynamic-images/${workspaceId}/uploads`}
            workspaceId={workspaceId}
          />
        </div>
      </div>
    </Form>
  )
}
