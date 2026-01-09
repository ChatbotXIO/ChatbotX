"use client"

import {
  type WhatsappAppSchema,
  whatsappAppSchema,
} from "@aha.chat/database/types"
import { InputField } from "@aha.chat/ui/components/form/input-field"
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
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useForm } from "react-hook-form"

type EditWhatsappAppDialogProps = {
  triggerClassName?: string
}

export default function EditWhatsappAppDialog({
  triggerClassName,
}: EditWhatsappAppDialogProps) {
  const [open, setOpen] = useState(false)
  const t = useTranslations()

  const form = useForm<WhatsappAppSchema>({
    resolver: zodResolver(whatsappAppSchema),
    defaultValues: {
      clientId: "",
      clientSecret: "",
      verifyToken: "",
      version: "v24.0",
      configId: "",
    },
  })

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button className={triggerClassName}>{t("actions.edit")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Whatsapp App</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form className="flex flex-col gap-6">
            <InputField label="Client ID" name="clientId" required />
            <InputField
              label="Client Secret"
              name="clientSecret"
              required
              type="password"
            />
            <InputField
              label="Webhook Verify Token"
              name="verifyToken"
              required
            />
            <InputField
              label="Version"
              name="version"
              placeholder="v24.0"
              required
            />
            <InputField label="Config ID" name="configId" required />
          </form>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t("actions.cancel")}
              </Button>
            </DialogClose>
            <Button disabled={!form.formState.isValid} type="submit">
              {t("actions.confirm")}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
