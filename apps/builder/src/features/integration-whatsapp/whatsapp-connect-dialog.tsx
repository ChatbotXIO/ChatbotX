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
import { useTranslate } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import WhatsappIcon from "@/components/icons/whatsapp"
import { connectWhatsappAction } from "./actions/connect.action"
import { connectWhatsappSchema } from "./schemas"

export function WhatsappConnectDialog({ chatbotId }: { chatbotId: string }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const { t } = useTranslate()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      connectWhatsappAction.bind(null, chatbotId),
      zodResolver(connectWhatsappSchema),
      {
        actionProps: {
          onSuccess: () => {
            toast.success("Connected Whatsapp successfully")
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
        <Button size="sm">{t("Integrations.ConnectBtn")}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WhatsappIcon />
            <span>Whatsapp</span>
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form className="flex-1 space-y-4" onSubmit={handleSubmitWithAction}>
            <InputField
              label={t("Integrations.Whatsapp.WabaId")}
              name="wabaId"
            />
            <InputField
              label={t("Integrations.Whatsapp.AccessToken")}
              name="accessToken"
            />

            <DialogFooter>
              <DialogClose asChild>
                <Button
                  onClick={resetFormAndAction}
                  type="button"
                  variant="secondary"
                >
                  {t("common.cancelBtn")}
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
                {t("common.confirmBtn")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
