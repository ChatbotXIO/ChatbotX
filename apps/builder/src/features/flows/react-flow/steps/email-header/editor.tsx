"use client"

import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { useSmtpInboxOptions } from "@/features/inboxes/provider/inbox-hook"

type EmailHeaderStepEditorProps = {
  parentName: string
}

export default function EmailHeaderStepEditor(
  props: EmailHeaderStepEditorProps,
) {
  const { parentName } = props
  const t = useTranslations()
  const smtpInboxOptions = useSmtpInboxOptions()

  return (
    <div className="flex flex-col gap-2">
      <SelectField
        label={t("fields.smtpChannel.label")}
        name={`${parentName}.integrationSmtpId`}
        options={smtpInboxOptions}
      />

      <SelectField
        label={t("fields.topicId.label")}
        name={`${parentName}.topicId`}
        options={[]}
      />

      <TiptapEditorField
        label={t("fields.from.label")}
        name={`${parentName}.from`}
      />

      <TiptapEditorField
        label={t("fields.to.label")}
        name={`${parentName}.to`}
      />

      <TiptapEditorField
        label={t("fields.subject.label")}
        name={`${parentName}.subject`}
      />

      <TiptapEditorField
        label={t("fields.preheader.label")}
        name={`${parentName}.preheader`}
      />
    </div>
  )
}
