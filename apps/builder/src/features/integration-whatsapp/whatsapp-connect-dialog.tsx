"use client"

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
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import WhatsappIcon from "@/components/icons/whatsapp"
import { connectWhatsappAction } from "./actions/connect.action"
import { connectWhatsappSchema } from "./schemas"

export function WhatsappConnectDialog({ chatbotId }: { chatbotId: string }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const t = useTranslations()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      connectWhatsappAction.bind(null, chatbotId),
      zodResolver(connectWhatsappSchema),
      {
        actionProps: {
          onSuccess: () => {
            toast.success(
              t("messages.connectedSuccessfully", {
                feature: t("fields.whatsapp.label"),
              }),
            )
            resetFormAndAction()
            setOpen(false)
            router.refresh()
          },
          onError: ({ error }) => {
            error.serverError && toast.error(error.serverError)
          },
        },
        formProps: {
          mode: "onChange",
          defaultValues: {
            wabaId: "",
            accessToken: "",
          },
        },
      },
    )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm">{t("actions.connect")}</Button>
      </DialogTrigger>
      <DialogContent
        className={"max-h-screen overflow-y-scroll lg:max-w-screen-lg"}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WhatsappIcon />
            <span>{t("fields.whatsapp.label")}</span>
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form className="flex-1 space-y-4" onSubmit={handleSubmitWithAction}>
            <InputField label={t("fields.wabaId.label")} name="wabaId" />
            <InputField
              label={t("fields.accessToken.label")}
              name="accessToken"
            />

            <DialogFooter>
              <DialogClose asChild>
                <Button
                  onClick={resetFormAndAction}
                  type="button"
                  variant="secondary"
                >
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
                {t("actions.confirm")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
