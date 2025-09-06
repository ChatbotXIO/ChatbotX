"use client"

import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { openAILanguageModels } from "../providers/openai"

type OpenAIModelSelectFieldProps = {
  name: string
}

export const OpenAIModelSelectField = ({
  name,
}: OpenAIModelSelectFieldProps) => {
  const t = useTranslations()

  return (
    <SelectField
      label={t("fields.model.label")}
      name={name}
      options={openAILanguageModels}
      placeholder="Select model Open AI"
    />
  )
}
