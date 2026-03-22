"use client"

import { Input } from "@aha.chat/ui/components/ui/input"
import { useTranslations } from "next-intl"
import { useFormContext } from "react-hook-form"
import { DirectUploadOrInsertLink } from "@/components/direct-upload"
import { ButtonGroupEditor } from "@/features/flows/react-flow/steps/button/editor"

type SendCardStepEditorProps = {
  parentName: string
}

const SendCardStepEditor = (props: SendCardStepEditorProps) => {
  const { parentName } = props
  const { register } = useFormContext()
  const t = useTranslations()

  return (
    <div className="flex flex-col rounded-lg border border-gray-200">
      <div className="relative flex flex-col gap-2 bg-secondary px-3 py-2">
        <DirectUploadOrInsertLink
          fileType="image"
          parentName={`${parentName}.image`}
        />

        <Input
          placeholder={`${t("fields.title.placeholder")} (required)`}
          required
          {...register(`${parentName}.title`)}
        />

        <Input
          placeholder={t("fields.subtitle.placeholder")}
          {...register(`${parentName}.subtitle`)}
        />
      </div>
      <div className="bg-slate-200 px-3 py-2">
        <ButtonGroupEditor parentName={`${parentName}.buttons`} />
      </div>
    </div>
  )
}

export default SendCardStepEditor
