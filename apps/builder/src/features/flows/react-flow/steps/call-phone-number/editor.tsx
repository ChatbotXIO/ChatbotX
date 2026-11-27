"use client"

import { buttonTypes, isNativeButtonType } from "@chatbotx.io/flow-config"
import { useTranslations } from "next-intl"
import { useButtonEditorChannel } from "../../button-editor-channel"
import { BaseStepEditor } from "../base/editor"
import { PhoneNumberField } from "./phone-number-field"

type CallPhoneNumberStepEditorProps = {
  parentName: string
}

const CallPhoneNumberStepEditor = ({
  parentName,
}: CallPhoneNumberStepEditorProps) => {
  const t = useTranslations()
  const channel = useButtonEditorChannel()
  const isNative = isNativeButtonType(channel, buttonTypes.enum.callPhoneNumber)

  return (
    // The button editor already names the action above, so no title here.
    <BaseStepEditor>
      <div className="flex flex-col gap-2">
        <PhoneNumberField
          label={t("fields.phoneNumber.label")}
          name={`${parentName}.phoneNumber`}
        />
        {isNative ? null : (
          <p className="text-muted-foreground text-sm">
            {t("flows.callPhoneNumber.fallbackHint")}
          </p>
        )}
      </div>
    </BaseStepEditor>
  )
}

export default CallPhoneNumberStepEditor
