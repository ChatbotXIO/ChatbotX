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
import { FileSpreadsheetIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

type SpreadsheetDialogProps = {
  open: boolean
  onOpenChange: (val: boolean) => void
  name: string
  onSubmit: () => void
  children?: ReactNode
}

export const SpreadsheetDialog = ({
  open = false,
  onOpenChange,
  name,
  onSubmit,
  children,
}: SpreadsheetDialogProps) => {
  const t = useTranslations()
  // const { formState } = useFormContext()

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogTrigger asChild>
        <div className="flex flex-col items-center rounded-md border-2 border-transparent bg-slate-200 p-2 transition-all ease-in hover:cursor-pointer hover:border-blue-500 hover:shadow-xl">
          <div className="flex items-center justify-center gap-2">
            <FileSpreadsheetIcon className="text-gray-500" size={20} />
            <p className="font-medium text-sm">Google Sheets</p>
          </div>
          <div className="mt-2 text-gray-500 text-xs">
            {t(`flows.stepType.${name}` as keyof typeof t)}
          </div>
        </div>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined} className="flex-1">
        <DialogHeader>
          <DialogTitle className="capitalize">
            Google Sheets {t(`flows.stepType.${name}` as keyof typeof t)}
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

          <Button
            onClick={() => onSubmit()}
            size="sm"
            // disabled={!formState.isValid}
            type="button"
          >
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
