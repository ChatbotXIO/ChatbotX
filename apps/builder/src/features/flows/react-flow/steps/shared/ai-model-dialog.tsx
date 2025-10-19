"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import type { LucideIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { useState } from "react"

type AIModelDialogProps = {
  name: string
  children?: ReactNode
  icon: LucideIcon
  iconColor: string
  modelLabel: string
  titleKey: string
  onSubmit?: () => void
}

export const AIModelDialog = (props: AIModelDialogProps) => {
  const {
    name,
    children,
    icon: Icon,
    iconColor,
    modelLabel,
    titleKey,
    onSubmit,
  } = props
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const handleContinue = () => {
    // Trigger form submission if provided
    if (onSubmit) {
      onSubmit()
    }
    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <div className="flex flex-col items-center rounded-md border-2 border-transparent bg-slate-200 p-2 transition-all ease-in hover:cursor-pointer hover:border-blue-500 hover:shadow-xl">
          <div className="flex items-center justify-center gap-2">
            <Icon className={iconColor} size={20} />
            <p className="font-medium text-sm">{modelLabel}</p>
          </div>
          <div className="mt-2 text-gray-500 text-xs">{name}</div>
        </div>
      </DialogTrigger>
      <DialogContent
        className={"max-h-screen overflow-y-scroll lg:max-w-screen-lg"}
      >
        <DialogHeader>
          <DialogTitle className="capitalize">
            {t(titleKey as keyof typeof t)} - {name}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        {children}

        <DialogFooter className="flex items-end">
          <Button
            onClick={() => setOpen(false)}
            size="sm"
            type="button"
            variant="secondary"
          >
            {t("actions.cancel")}
          </Button>

          <Button
            className="cursor-pointer bg-blue-600 hover:bg-blue-700"
            onClick={handleContinue}
            size="sm"
            type="button"
          >
            {t("actions.continue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
