"use client"

import { WhatsappTemplateCategory } from "@ahachat.ai/database/types"
import { useMemo } from "react"
import { useFormContext } from "react-hook-form"
import { VolumeIcon } from "lucide-react"
import { useTranslate } from "@tolgee/react"
import { TemplateType } from "./type"
import { SelectField } from "@/components/form/select-field"

export function CategorySelect({
  name,
  label,
  isRequired = false,
}: {
  name: string
  label: string
  isRequired?: boolean
}) {
  const { t } = useTranslate()
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
        name={name}
        label={label}
        isRequired={isRequired}
        placeholder="Please select"
        options={options}
      />
      {category === WhatsappTemplateCategory.MARKETING && (
        <div className="grid grid-flow-col auto-cols-min gap-x-4 items-center bg-slate-200 p-6 rounded">
          <VolumeIcon size={36} className="row-span-2" />
          <span className="font-bold">Marketing</span>
          <span className="text-gray-400">
            {t("whatsapp.category.MarketingDesc")}
          </span>
        </div>
      )}
      {category === WhatsappTemplateCategory.UTILITY && (
        <div className="grid grid-flow-col auto-cols-min items-center bg-slate-200 p-6 rounded">
          <VolumeIcon size={36} className="row-span-2" />
          <span className="font-bold">Utility</span>
          <span>{t("whatsapp.category.UtilityDesc")}</span>
        </div>
      )}
    </>
  )
}
