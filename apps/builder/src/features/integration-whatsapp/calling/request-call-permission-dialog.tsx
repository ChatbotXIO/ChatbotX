"use client"

import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import type React from "react"
import { type ReactNode, useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { requestCallPermissionAction } from "./actions/request-call-permission.action"

const formSchema = z.object({
  text: z.string().trim().min(1).max(1024),
})
type FormValues = z.infer<typeof formSchema>

type RequestCallPermissionDialogProps = {
  workspaceId: string
  conversationId: string
  /** Inbox backing the displayed conversation — pins the sending number. */
  inboxId?: string
  children: ReactNode
}

export function RequestCallPermissionDialog({
  workspaceId,
  conversationId,
  inboxId,
  children,
}: RequestCallPermissionDialogProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { text: t("whatsapp.calls.permissionRequestDefaultBody") },
    mode: "onChange",
  })

  const { execute, isPending } = useAction(
    requestCallPermissionAction.bind(null, workspaceId, conversationId),
    {
      onSuccess: () => {
        toast.success(t("whatsapp.calls.permissionRequestSent"))
        setOpen(false)
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("messages.unknownError"))
      },
    },
  )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={children as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("whatsapp.calls.permissionRequestTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("whatsapp.calls.permissionRequestDescription")}
          </DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              e.stopPropagation()
              form.handleSubmit((values) => execute({ ...values, inboxId }))(e)
            }}
          >
            <TextareaField
              label={t("whatsapp.calls.permissionRequestBodyLabel")}
              name="text"
              required
            />
            <div className="flex justify-end gap-2">
              <DialogClose
                render={
                  <Button size="sm" type="button" variant="ghost">
                    {t("actions.cancel")}
                  </Button>
                }
              />
              <Button
                disabled={isPending || !form.formState.isValid}
                size="sm"
                type="submit"
              >
                {t("actions.send")}
              </Button>
            </div>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  )
}
