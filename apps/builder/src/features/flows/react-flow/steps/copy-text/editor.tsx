"use client"

import {
  buttonTypes,
  COPY_TEXT_MAX,
  isNativeButtonType,
} from "@chatbotx.io/flow-config"
import { useTranslations } from "next-intl"
import { PlainTextEditorField } from "@/components/tiptap/plain-text-editor-field"
import { useButtonEditorChannel } from "../../button-editor-channel"
import { BaseStepEditor } from "../base/editor"

type CopyTextStepEditorProps = {
  parentName: string
}

const CopyTextStepEditor = ({ parentName }: CopyTextStepEditorProps) => {
  const t = useTranslations()
  const channel = useButtonEditorChannel()
  const isNative = isNativeButtonType(channel, buttonTypes.enum.copyText)

  return (
    // The button editor already names the action above, so no title here.
    <BaseStepEditor>
      <div className="flex flex-col gap-2">
        <PlainTextEditorField
          description={t("flows.copyText.limitHint", { max: COPY_TEXT_MAX })}
          includeBotFieldVariables
          label={t("flows.copyText.textLabel")}
          name={`${parentName}.text`}
          required
          showEmojiPicker={false}
        />
        {isNative ? null : (
          <p className="text-muted-foreground text-sm">
            {t("flows.copyText.fallbackHint")}
          </p>
        )}
      </div>
    </BaseStepEditor>
  )
}

export default CopyTextStepEditor
