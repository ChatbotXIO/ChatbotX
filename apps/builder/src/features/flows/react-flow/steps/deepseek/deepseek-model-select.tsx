import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useTranslations } from "next-intl"

const deepseekModelOptions = [
  { label: "DeepSeek-V2.5", value: "deepseek-chat" },
  { label: "DeepSeek-V2", value: "deepseek-chat-v2" },
  { label: "DeepSeek-Coder", value: "deepseek-coder" },
  { label: "DeepSeek-Coder-V2", value: "deepseek-coder-v2" },
]

type DeepseekModelProps = {
  name: string
}

export const DeepseekModelSelect = (props: DeepseekModelProps) => {
  const { name } = props
  const t = useTranslations()

  return (
    <SelectField
      label={t("fields.model.label")}
      name={name}
      options={deepseekModelOptions}
      placeholder={t("fields.placeholders.selectModelDeepseek")}
    />
  )
}
