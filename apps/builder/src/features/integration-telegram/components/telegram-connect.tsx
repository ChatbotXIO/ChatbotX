"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { useState } from "react"
import { toast } from "sonner"
import { connectTelegramAction } from "../actions/connect-telegram.action"
import { connectTelegramRequest } from "../schemas/request"

export function TelegramConnect({
  workspaceId,
  children,
}: {
  workspaceId?: string | null
  children?: ReactNode
}) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const { form, handleSubmitWithAction } = useHookFormAction(
    connectTelegramAction,
    zodResolver(connectTelegramRequest),
    {
      actionProps: {
        onSuccess: () => {
          setOpen(false)
          if (workspaceId) {
            router.push(
              `/space/${workspaceId}/settings/channels?channel=telegram`,
            )
          } else {
            router.push("/")
          }
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          botToken: "",
          workspaceId,
        },
      },
    },
  )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        {children ?? (
          <Button size="sm" type="button" variant="secondary">
            {t("actions.connect", { feature: t("fields.telegram.label") })}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("actions.addFeature", { feature: t("fields.telegram.label") })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={handleSubmitWithAction}
          >
            <InputField name="workspaceId" type="hidden" />
            <InputField
              label={t("fields.telegram.botToken")}
              name="botToken"
              placeholder="123456789:AABBccdd..."
              required
              type="password"
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  {t("actions.cancel")}
                </Button>
              </DialogClose>
              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                {t("actions.connect")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
