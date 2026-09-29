"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { useTranslations } from "next-intl"
import { type ReactElement, useState } from "react"
import { CreateContactForm } from "./create-contact-form"
import { useInvalidateContacts } from "./hooks/use-contacts"

export function CreateContactDialog({
  workspaceId,
  trigger,
}: {
  workspaceId: string
  trigger?: ReactElement
}) {
  const t = useTranslations()
  const invalidateContacts = useInvalidateContacts()

  const [open, setOpen] = useState(false)
  const onSubmmited = () => {
    setOpen(false)
    invalidateContacts()
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          trigger ? (
            trigger
          ) : (
            <Button variant="default">
              {t("actions.createFeature", {
                feature: t("fields.contact.label"),
              })}
            </Button>
          )
        }
      />
      <DialogContent className={"max-h-screen overflow-y-scroll lg:max-w-5xl"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.createFeature", {
              feature: t("fields.contact.label"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <CreateContactForm
            onCancelled={() => setOpen(false)}
            onSubmmited={onSubmmited}
            workspaceId={workspaceId}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
