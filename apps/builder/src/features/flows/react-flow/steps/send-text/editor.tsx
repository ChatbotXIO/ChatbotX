"use client"

import { resolveSendTextLengthLimits } from "@chatbotx.io/flow-config"
import { useWatch } from "react-hook-form"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { ButtonGroupEditor } from "../button/editor"
import { TiktokTitleNotice } from "./tiktok-title-notice"

type SendTextStepEditorProps = {
  parentName: string
}

const SendTextStepEditor = (props: SendTextStepEditorProps) => {
  const { parentName } = props

  // Watched rather than read: the budget shown must follow the node's channel
  // and, on TikTok, whether the message is sent as a card — all change while
  // editing. Quick replies are watched at the form root because they belong to
  // the node, not the step, yet they turn the message into the same 40-char
  // card title that the step's own buttons do.
  const channel = useWatch({ name: "beforeStep.channel" })
  const buttons = useWatch({ name: `${parentName}.buttons` })
  const quickReplies = useWatch({ name: "quickReplies" })

  const limits = resolveSendTextLengthLimits({
    channel,
    hasButtons: (buttons?.length ?? 0) > 0,
    hasQuickReplies: (quickReplies?.length ?? 0) > 0,
  })

  return (
    <div className="items-center justify-center overflow-hidden rounded-lg">
      <div className="bg-secondary px-4 py-2">
        <TiptapEditorField
          includeBotFieldVariables
          includeCouponVariables
          maxLength={limits.text}
          name={`${parentName}.text`}
        />
        <TiktokTitleNotice parentName={parentName} />
      </div>

      <div className="bg-slate-200 px-3 py-2 dark:bg-neutral-900">
        <ButtonGroupEditor parentName={`${parentName}.buttons`} />
      </div>
    </div>
  )
}

export default SendTextStepEditor
