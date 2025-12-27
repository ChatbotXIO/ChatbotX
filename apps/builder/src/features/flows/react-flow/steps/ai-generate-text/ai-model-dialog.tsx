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
import type { LucideIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

type AIModelDialogProps = {
  open: boolean
  onOpenChange: (val: boolean) => void
  name: string
  onSubmit: () => void
  children?: ReactNode
  icon: LucideIcon
  iconColor: string
  modelLabel: string
  showTrigger?: boolean
}

export const AIModelDialog = ({
  open,
  onOpenChange,
  name,
  onSubmit,
  children,
  icon: Icon,
  iconColor,
  modelLabel,
  showTrigger = true,
}: AIModelDialogProps) => {
  const t = useTranslations()

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      {showTrigger && (
        <DialogTrigger asChild>
          <div className="flex flex-col items-center rounded-md border-2 border-transparent bg-slate-200 p-2 transition-all ease-in hover:cursor-pointer hover:border-blue-500 hover:shadow-xl">
            <div className="flex items-center justify-center gap-2">
              <Icon className={iconColor} size={20} />
              <p className="font-medium text-sm">{modelLabel}</p>
            </div>
            <div className="mt-2 text-gray-500 text-xs">{name}</div>
          </div>
        </DialogTrigger>
      )}
      <DialogContent
        aria-describedby={undefined}
        className="max-h-screen overflow-y-scroll lg:max-w-screen-lg"
      >
        <DialogHeader>
          <DialogTitle className="capitalize">
            {modelLabel} - {name}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="max-h-[calc(100vh-150px)] overflow-y-auto">
          {children}
        </div>
        <DialogFooter className="flex items-end">
          <DialogClose asChild>
            <Button size="sm" type="button" variant="secondary">
              {t("actions.cancel")}
            </Button>
          </DialogClose>
          <Button
            className="cursor-pointer bg-blue-600 hover:bg-blue-700"
            onClick={onSubmit}
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
