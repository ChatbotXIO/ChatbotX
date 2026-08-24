"use client"

import { Input } from "@chatbotx.io/ui/components/ui/input"
import { useTranslations } from "next-intl"
import { useFormContext } from "react-hook-form"
import { MediaLibraryOrInsertLink } from "@/components/media-library-or-insert-link"
import { ButtonGroupEditor } from "@/features/flows/react-flow/steps/button/editor"

type SendCardStepEditorProps = {
  parentName: string
}

const SendCardStepEditor = ({ parentName }: SendCardStepEditorProps) => {
  const { register } = useFormContext()
  const t = useTranslations()

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200">
      <div className="relative flex flex-col gap-2 bg-secondary px-3 py-2">
        <MediaLibraryOrInsertLink
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
      <div className="bg-slate-200 px-3 py-2 dark:bg-neutral-900">
        <ButtonGroupEditor parentName={`${parentName}.buttons`} />
      </div>
    </div>
  )
}

export default SendCardStepEditor
