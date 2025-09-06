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

export const SendCardStepEditor = (props: SendCardStepEditorProps) => {
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
              "!p-0 size-6",
              layout === CardLayout.HORIZONTAL ? "text-destructive" : "",
            )}
            onClick={() =>
              setValue(`${parentName}.layout`, CardLayout.HORIZONTAL)
            }
            size="icon"
            variant="ghost"
          >
            <RectangleHorizontalIcon />
          </Button>
          <Button
            className={cn(
              "!p-0 size-6",
              layout === CardLayout.VERTICAL ? "text-destructive" : "",
            )}
            onClick={() =>
              setValue(`${parentName}.layout`, CardLayout.VERTICAL)
            }
            size="icon"
            variant="ghost"
          >
            <RectangleVerticalIcon />
          </Button>
        </div>

        <DirectUploadOrInsertLink
          fileType={FileType.IMAGE}
          parentName={`${parentName}.image`}
        />

        <Input
          className=""
          placeholder={`${t("fields.title.placeholder")} (required)`}
          required
          {...register(`${parentName}.title`)}
        />

        <Input
          className=""
          placeholder={t("fields.subtitle.placeholder")}
          {...register(`${parentName}.subtitle`)}
        />

        <Input
          className=""
          placeholder={t("fields.cardURL.placeholder")}
          {...register(`${parentName}.cardURL`)}
        />
      </div>
      <div className="bg-slate-200 px-3 py-2">
        <ButtonGroupEditor parentName={`${parentName}.buttons`} />
      </div>
    </div>
  )
}
