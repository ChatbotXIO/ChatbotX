import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog"

type BaseDialogProps = {
  title: string
  description?: string
  trigger: React.ReactNode
  children: React.ReactNode
}

export function BaseDialog(props: BaseDialogProps) {
  const { title, description, trigger, children } = props
  const [open, setOpen] = useState(false)

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : (
            <DialogDescription />
          )}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
