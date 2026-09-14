"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useTranslations } from "next-intl"
import { useFormContext } from "react-hook-form"

const COMMON_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "👏"]

type ReactionStepEditorProps = {
  parentName: string
}

export default function ReactionStepEditor({
  parentName,
}: ReactionStepEditorProps) {
  const t = useTranslations()
  const { setValue, watch } = useFormContext()
  const currentEmoji = watch(`${parentName}.emoji`)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="font-medium text-sm">
          {t("flows.fields.reactionEmojiLabel")}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {COMMON_EMOJIS.map((emoji) => (
            <Button
              className={`h-9 w-9 p-0 text-base ${
                currentEmoji === emoji ? "border-2 border-primary" : ""
              }`}
              key={emoji}
              onClick={() =>
                setValue(`${parentName}.emoji`, emoji, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              type="button"
              variant="outline"
            >
              {emoji}
            </Button>
          ))}
        </div>
      </div>

      <InputField
        description={t("flows.fields.reactionEmojiCustomDescription")}
        label={t("flows.fields.reactionEmojiCustomLabel")}
        name={`${parentName}.emoji`}
        placeholder="👍"
        required
      />
    </div>
  )
}
