"use client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { BotMessageSquare } from "lucide-react"
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
            <BotMessageSquare size={20} color="grey" />
            <p className="font-bold">OpenAI</p>
          </div>
          <span className="text-gray-500 italic">{name}</span>
        </div>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="capitalize">Open AI {name}</DialogTitle>
        </DialogHeader>

        {children}
      </DialogContent>
    </Dialog>
  )
}
