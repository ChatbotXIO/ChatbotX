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
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
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
  const t = useTranslations()

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
          <Button variant="default">
            {t("actions.createFeature", { feature: t("fields.contact.label") })}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className={"max-h-screen overflow-y-scroll lg:max-w-5xl"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.createTitle", { feature: t("fields.contact.label") })}
          </DialogTitle>
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
