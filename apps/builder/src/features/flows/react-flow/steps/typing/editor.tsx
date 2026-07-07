"use client"

import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { useTranslations } from "next-intl"

type TypingStepEditorProps = {
  parentName: string
}

export default function TypingStepEditor(props: TypingStepEditorProps) {
  const { parentName } = props
  const t = useTranslations()

  return (
    <div className="flex flex-col gap-3">
      <InputNumberField
        label={t("flows.fields.typingSecondsLabel")}
        max={60}
        min={1}
        name={`${parentName}.seconds`}
        required
        stepper={1}
      />
    </div>
  )
}
