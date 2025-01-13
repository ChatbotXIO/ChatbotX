"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
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
            <p className="font-bold">OpenAI</p>
          </div>
          <span className="text-gray-500 italic">
            <T keyName={name} />
          </span>
        </div>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="capitalize">Open AI {name}</DialogTitle>
        </DialogHeader>
        {children}

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              <T keyName="flows.OpenAI.Button.Cancel" />
            </Button>
          </DialogClose>

          <Button type="button">
            <T keyName="flows.OpenAI.Button.Continue" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
