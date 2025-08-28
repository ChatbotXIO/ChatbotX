"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { BotMessageSquareIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

type OpenAIDialogProps = {
  name: string
  children?: ReactNode
}

export const OpenAIDialog = (props: OpenAIDialogProps) => {
  const { name, children } = props
  const t = useTranslations()

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="flex flex-col items-center rounded-md border-2 border-transparent bg-slate-200 p-2 transition-all ease-in hover:cursor-pointer hover:border-blue-500 hover:shadow-xl">
          <div className="flex items-center justify-center gap-2">
            <BotMessageSquareIcon className="text-gray-500" size={20} />
            <p className="font-medium text-sm">{t("fields.openai.label")}</p>
          </div>
          <div className="mt-2 text-gray-500 text-xs">
            {t(`flows.stepType.${name}` as keyof typeof t)}
          </div>
        </div>
      </DialogTrigger>
      <DialogContent
        className={"max-h-screen overflow-y-scroll lg:max-w-screen-lg"}
      >
        <DialogHeader>
          <DialogTitle className="capitalize">
            {t("fields.openai.label")} - {name}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        {children}

        <DialogFooter className="flex items-end">
          <DialogClose asChild>
            <Button size="sm" type="button" variant="secondary">
              {t("actions.cancel")}
            </Button>
          </DialogClose>

          <Button size="sm" type="button">
            {t("actions.continue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
