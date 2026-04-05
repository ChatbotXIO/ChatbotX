"use client"

import { whatsappTemplateCategories } from "@chatbotx.io/database/partials"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { VolumeIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useFormContext } from "react-hook-form"
import { templateTypes } from "../type"

export function WhatsappMessageTemplateCategorySelect({
  name,
  label,
  required = false,
}: {
  name: string
  label: string
  required?: boolean
}) {
  const t = useTranslations()
  const { watch } = useFormContext()
  const category = watch(name)
  const templateType = watch("templateType")
  const allowOptions = useMemo(() => {
    if (
      [templateTypes.enum.ViewCatalog, templateTypes.enum.ViewProduct].includes(
        templateType,
      )
    ) {
      return [whatsappTemplateCategories.enum.MARKETING]
    }

    return [
      whatsappTemplateCategories.enum.MARKETING,
      whatsappTemplateCategories.enum.UTILITY,
    ]
  }, [templateType])

  const options = useMemo(
    () =>
      [
        {
          label: "Marketing",
          value: whatsappTemplateCategories.enum.MARKETING,
        },
        {
          label: "Utility",
          value: whatsappTemplateCategories.enum.UTILITY,
        },
      ].filter((option) => allowOptions.includes(option.value)),
    [allowOptions],
  )

  return (
    <>
      <SelectField
        label={label}
        name={name}
        options={options}
        placeholder="Please select"
        required={required}
      />
      {category === whatsappTemplateCategories.enum.MARKETING && (
        <div className="grid auto-cols-min grid-flow-col items-center gap-x-4 rounded bg-slate-200 p-6">
          <VolumeIcon className="row-span-2" size={36} />
          <span className="font-bold">
            {t("whatsapp.category.marketing.label")}
          </span>
          <span className="text-gray-400">
            {t("whatsapp.category.marketing.description")}
          </span>
        </div>
      )}
      {category === whatsappTemplateCategories.enum.UTILITY && (
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
