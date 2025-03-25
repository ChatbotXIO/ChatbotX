"use client"

import { FormInput } from "@/components/form-input"
import WhastsappIcon from "@/components/icons/whatsapp"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Form } from "@/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { T } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { connectWhatsappAction } from "./actions/connect.action"
import { connectWhatsappSchema } from "./schemas"

export function WhatsappConnectDialog({ chatbotId }: { chatbotId: string }) {
  const [open, setOpen] = useState(false)

  const router = useRouter()

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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <T keyName="Integrations.ConnectBtn" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WhastsappIcon />
            <span>Whatsapp</span>
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmitWithAction} className="flex-1 space-y-4">
            <FormInput
              label={<T keyName={"Integrations.Whatsapp.WabaId"} />}
              name="wabaId"
            />
            <FormInput
              label={<T keyName={"Integrations.Whatsapp.AccessToken"} />}
              name="accessToken"
            />

            <DialogFooter>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={resetFormAndAction}
                >
                  <T keyName="common.cancelBtn" />
                </Button>
              </DialogClose>

              <Button
                type="submit"
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                <T keyName="common.confirmBtn" />
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
