"use client"

import { CardLayout, FileType } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Input } from "@aha.chat/ui/components/ui/input"
import { cn } from "@aha.chat/ui/lib/utils"
import { RectangleHorizontalIcon, RectangleVerticalIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFormContext } from "react-hook-form"
import { DirectUploadOrInsertLink } from "@/components/direct-upload"
import { ButtonGroupEditor } from "@/features/flows/react-flow/steps/button/editor"

type SendCardStepEditorProps = {
  parentName: string
}

const SendCardStepEditor = (props: SendCardStepEditorProps) => {
  const { parentName } = props
  const { register, setValue, watch } = useFormContext()
  const t = useTranslations()

  const layout = watch(`${parentName}.layout`)

  return (
    <div className="flex flex-col rounded-lg border border-gray-200">
      <div className="relative flex flex-col gap-2 bg-secondary px-3 py-2">
        <div className="absolute top-2 left-3 z-1 flex items-center gap-1 rounded-full bg-white px-2 py-1">
          <Button
            className={cn(
              "size-6 p-0!",
              layout === CardLayout.horizontal ? "text-destructive" : "",
            )}
            onClick={() =>
              setValue(`${parentName}.layout`, CardLayout.horizontal)
            }
            size="icon"
            variant="ghost"
          >
            <RectangleHorizontalIcon />
          </Button>
          <Button
            className={cn(
              "size-6 p-0!",
              layout === CardLayout.vertical ? "text-destructive" : "",
            )}
            onClick={() =>
              setValue(`${parentName}.layout`, CardLayout.vertical)
            }
            size="icon"
            variant="ghost"
          >
            <RectangleVerticalIcon />
          </Button>
        </div>

        <DirectUploadOrInsertLink
          fileType={FileType.image}
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

        <Input
          placeholder={t("fields.cardUrl.placeholder")}
          {...register(`${parentName}.cardUrl`)}
        />
      </div>
      <div className="bg-slate-200 px-3 py-2">
        <ButtonGroupEditor parentName={`${parentName}.buttons`} />
      </div>
    </div>
  )
}

export default SendCardStepEditor
