"use client"

import { AIGenerateImageProvider } from "@aha.chat/flow-config"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useFormContext } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { IMAGE_QUALITY_OPTIONS, IMAGE_SIZE_OPTIONS } from "./config"

type AIModelFormFieldsProps = {
  modelSelectComponent: React.ComponentType<{ name: string }>
}

export const AIModelFormFields = ({
  modelSelectComponent: ModelSelectComponent,
}: AIModelFormFieldsProps) => {
  const t = useTranslations()
  const { watch } = useFormContext()
  const provider = watch("provider")

  const qualityOptions = useMemo(
    () =>
      IMAGE_QUALITY_OPTIONS.map((opt) => ({
        label: t(opt.labelKey),
        value: opt.value,
      })),
    [t],
  )

  const sizeOptions = useMemo(
    () =>
      IMAGE_SIZE_OPTIONS.map((opt) => ({
        label: "label" in opt ? opt.label : t(opt.labelKey),
        value: opt.value,
      })) as Array<{ label: string; value: string }>,
    [t],
  )

  return (
    <div className="space-y-4">
      <InputField
        label={t("fields.userMessage.label")}
        name="prompt"
        required
      />

      {provider !== AIGenerateImageProvider.GEMINI && (
        <ModelSelectComponent name="model" />
      )}

      <SelectField
        label={t("fields.quality.label")}
        name="quality"
        options={qualityOptions}
        required
      />

      <SelectField
        label={t("fields.size.label")}
        name="size"
        options={sizeOptions}
        required
      />

      <CustomFieldSelect
        allowCreate={true}
        includeReserved={true}
        label={t("fields.outputCfId.label")}
        name="outputCfId"
        required
      />
    </div>
  )
}
