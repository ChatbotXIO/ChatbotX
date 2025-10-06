"use client"

import { WhatsappTemplateCategory } from "@aha.chat/database/types"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { VolumeIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useFormContext } from "react-hook-form"
import { TemplateType } from "../type"

export function WhatsappMessageTemplateCategorySelect({
  name,
  label,
  isRequired = false,
}: {
  name: string
  label: string
  isRequired?: boolean
}) {
  const t = useTranslations()
  const { watch } = useFormContext()
  const category = watch(name)
  const templateType = watch("templateType")
  const allowOptions = useMemo(() => {
    if (
      [TemplateType.ViewCatalog, TemplateType.ViewProduct].includes(
        templateType,
      )
    ) {
      return [WhatsappTemplateCategory.MARKETING]
    }

    return [
      WhatsappTemplateCategory.MARKETING,
      WhatsappTemplateCategory.UTILITY,
    ]
  }, [templateType])

  const options = useMemo(() => {
    return [
      {
        label: "Marketing",
        value: WhatsappTemplateCategory.MARKETING,
      },
      {
        label: "Utility",
        value: WhatsappTemplateCategory.UTILITY,
      },
    ].filter((option) => allowOptions.includes(option.value))
  }, [allowOptions])

  return (
    <>
      <SelectField
        label={label}
        name={name}
        options={options}
        placeholder="Please select"
        required={isRequired}
      />
      {category === WhatsappTemplateCategory.MARKETING && (
        <div className="grid auto-cols-min grid-flow-col items-center gap-x-4 rounded bg-slate-200 p-6">
          <VolumeIcon className="row-span-2" size={36} />
          <span className="font-bold">
            {t("whatsapp.category.makerting.label")}
          </span>
          <span className="text-gray-400">
            {t("whatsapp.category.makerting.description")}
          </span>
        </div>
      )}
      {category === WhatsappTemplateCategory.UTILITY && (
        <div className="grid auto-cols-min grid-flow-col items-center rounded bg-slate-200 p-6">
          <VolumeIcon className="row-span-2" size={36} />
          <span className="font-bold">
            {t("whatsapp.category.utility.label")}
          </span>
          <span>{t("whatsapp.category.utility.description")}</span>
        </div>
      )}
    </>
  )
}
