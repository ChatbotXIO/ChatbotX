"use client"

import type {
  DynamicImageFontFamily,
  DynamicImageTextElement,
} from "@chatbotx.io/database/partials"
import { ColorPickerField } from "@chatbotx.io/ui/components/form/color-picker-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { useTranslations } from "next-intl"
import type { CSSProperties } from "react"
import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import { DynamicImageVariableTextField } from "../plain-text-variable-field"
import type { DynamicImageElementPatch } from "../types"

const FONT_FAMILY_CSS_VALUES: Record<DynamicImageFontFamily, string> = {
  arial: "Arial, Helvetica, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  roboto: "Roboto, Arial, sans-serif",
  greatVibes: "'Great Vibes', cursive",
}

type DynamicImageTextLayerPreviewProps = {
  element: DynamicImageTextElement
}

export function DynamicImageTextLayerPreview(
  props: DynamicImageTextLayerPreviewProps,
) {
  const { element } = props

  const style: CSSProperties = {
    fontSize: element.fontSize,
    color: element.color,
    fontFamily: FONT_FAMILY_CSS_VALUES[element.fontFamily],
    fontWeight: element.bold ? 700 : 400,
    fontStyle: element.italic ? "italic" : "normal",
    textTransform: element.uppercase ? "uppercase" : "none",
    textAlign: element.align,
  }

  return (
    <div
      className="wrap-break-word h-full w-full overflow-hidden leading-tight"
      style={style}
    >
      {element.text}
    </div>
  )
}

type DynamicImageTextLayerEditFormProps = {
  element: DynamicImageTextElement
  onChange: (patch: Partial<DynamicImageTextElement>) => void
}

export function DynamicImageTextLayerEditForm(
  props: DynamicImageTextLayerEditFormProps,
) {
  const { element, onChange } = props
  const t = useTranslations()

  const form = useForm<DynamicImageTextElement>({
    defaultValues: element,
    mode: "onChange",
  })
  const fontFamily = form.watch("fontFamily")
  const showStyleToggles = fontFamily !== "greatVibes"

  useEffect(() => {
    const subscription = form.watch((values) => {
      onChange(values as DynamicImageElementPatch)
    })
    return () => subscription.unsubscribe()
  }, [form, onChange])

  return (
    <Form {...form}>
      <div className="flex flex-col gap-4">
        <Controller
          control={form.control}
          name="text"
          render={({ field }) => (
            <DynamicImageVariableTextField
              label={t("dynamicImages.editor.textContent")}
              onChange={field.onChange}
              value={field.value}
            />
          )}
        />

        <InputNumberField
          label={t("dynamicImages.editor.fontSize")}
          min={1}
          name="fontSize"
        />

        <SelectField
          label={t("dynamicImages.editor.fontFamily")}
          name="fontFamily"
          options={[
            {
              value: "arial",
              label: t("dynamicImages.editor.fontFamilyArial"),
            },
            {
              value: "serif",
              label: t("dynamicImages.editor.fontFamilySerif"),
            },
            {
              value: "roboto",
              label: t("dynamicImages.editor.fontFamilyRoboto"),
            },
            {
              value: "greatVibes",
              label: t("dynamicImages.editor.fontFamilyGreatVibes"),
            },
          ]}
        />

        <SelectField
          label={t("dynamicImages.editor.align")}
          name="align"
          options={[
            { value: "left", label: t("dynamicImages.editor.alignLeft") },
            { value: "center", label: t("dynamicImages.editor.alignCenter") },
            { value: "right", label: t("dynamicImages.editor.alignRight") },
          ]}
        />

        <ColorPickerField
          label={t("dynamicImages.editor.color")}
          name="color"
        />

        {showStyleToggles ? (
          <div className="flex flex-col gap-3">
            <SwitchField
              formItemClassName="flex flex-row items-center justify-between"
              label={t("dynamicImages.editor.bold")}
              name="bold"
            />
            <SwitchField
              formItemClassName="flex flex-row items-center justify-between"
              label={t("dynamicImages.editor.italic")}
              name="italic"
            />
            <SwitchField
              formItemClassName="flex flex-row items-center justify-between"
              label={t("dynamicImages.editor.uppercase")}
              name="uppercase"
            />
          </div>
        ) : null}
      </div>
    </Form>
  )
}
