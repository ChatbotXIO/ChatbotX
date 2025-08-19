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
import { T } from "@tolgee/react"
import { BotMessageSquareIcon } from "lucide-react"
import type { ReactNode } from "react"

type OpenAIDialogProps = {
  name: string
  children?: ReactNode
}

export const OpenAIDialog = (props: OpenAIDialogProps) => {
  const { name, children } = props

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="flex flex-col items-center rounded-md border-2 border-transparent bg-slate-200 p-2 transition-all ease-in hover:cursor-pointer hover:border-blue-500 hover:shadow-xl">
          <div className="flex items-center justify-center gap-2">
            <BotMessageSquareIcon className="text-gray-500" size={20} />
            <p className="font-medium text-sm">OpenAI</p>
          </div>
          <div className="mt-2 text-gray-500 text-xs">
            <T keyName={name} />
          </div>
        </div>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="capitalize">Open AI - {name}</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        {children}

        <DialogFooter className="flex items-end">
          <DialogClose asChild>
            <Button size="sm" type="button" variant="secondary">
              <T keyName="common.cancelBtn" />
            </Button>
          </DialogClose>

          <Button size="sm" type="button">
            <T keyName="common.continueBtn" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
