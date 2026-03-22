"use client"

import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"

type EmailHeaderStepEditorProps = {
  parentName: string
}

export default function EmailHeaderStepEditor(
  props: EmailHeaderStepEditorProps,
) {
  const { parentName } = props
  const t = useTranslations()

  return (
    <div className="flex flex-col gap-2">
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
