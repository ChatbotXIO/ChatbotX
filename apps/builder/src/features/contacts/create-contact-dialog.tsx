"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { useTranslate } from "@tolgee/react"
import { useRouter } from "next/navigation"
import { type ReactNode, useState } from "react"
import { CreateContactForm } from "./create-contact-form"

export function CreateContactDialog({
  chatbotId,
  trigger,
}: {
  chatbotId: string
  trigger?: ReactNode
}) {
  const router = useRouter()
  const { t } = useTranslate()

  const [open, setOpen] = useState(false)
  const onSubmmited = () => {
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        {trigger ? (
          trigger
        ) : (
          <Button variant="default">{t("common.createBtn")}</Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("contacts.create.title")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <CreateContactForm
            chatbotId={chatbotId}
            onCancelled={() => setOpen(false)}
            onSubmmited={onSubmmited}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
