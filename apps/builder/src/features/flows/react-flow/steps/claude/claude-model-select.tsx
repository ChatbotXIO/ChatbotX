import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useTranslations } from "next-intl"

// Claude model options - có thể cần cập nhật khi có thông tin chính xác về Claude models
const claudeModelOptions = [
  { label: "Claude 3.5 Sonnet", value: "claude-3-5-sonnet-20241022" },
  { label: "Claude 3.5 Haiku", value: "claude-3-5-haiku-20241022" },
  { label: "Claude 3 Opus", value: "claude-3-opus-20240229" },
  { label: "Claude 3 Sonnet", value: "claude-3-sonnet-20240229" },
  { label: "Claude 3 Haiku", value: "claude-3-haiku-20240307" },
]

type ClaudeModelProps = {
  name: string
}

export const ClaudeModelSelect = (props: ClaudeModelProps) => {
  const { name } = props
  const t = useTranslations()

  return (
    <SelectField
      label={t("fields.model.label")}
      name={name}
      options={claudeModelOptions}
      placeholder={t("fields.placeholders.selectModelClaude")}
    />
  )
}
