"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { T } from "@tolgee/react"
import { BotMessageSquareIcon } from "lucide-react"
import type { ReactNode } from "react"

interface OpenAIDialogProps {
  name: string
  children?: ReactNode
}

export const OpenAIDialog = ({ name, children }: OpenAIDialogProps) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="flex flex-col items-center rounded-md bg-slate-200 p-2 border-2 border-transparent transition-all ease-in hover:border-blue-500 hover:cursor-pointer hover:shadow-xl">
          <div className="flex items-center justify-center gap-2">
            <BotMessageSquareIcon size={20} className="text-gray-500" />
            <p className="font-medium text-sm">OpenAI</p>
          </div>
          <div className="text-gray-500 text-xs mt-2">
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
            <Button type="button" variant="secondary" size="sm">
              <T keyName="common.cancelBtn" />
            </Button>
          </DialogClose>

          <Button type="button" size="sm">
            <T keyName="common.continueBtn" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
