"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@aha.chat/ui/components/ui/form"
import { Input } from "@aha.chat/ui/components/ui/input"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { type ReactNode, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { connectSendFox } from "../actions/connect.action"
import { type ConnectSendFoxSchema, connectSendFoxSchema } from "../schemas"

type SendFoxConnectDialogProps = {
  chatbotId: string
  children: ReactNode
}

export function SendFoxConnectDialog({
  chatbotId,
  children,
}: SendFoxConnectDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const form = useForm<ConnectSendFoxSchema>({
    resolver: zodResolver(connectSendFoxSchema),
    defaultValues: {
      accessToken: "",
    },
  })

  const { executeAsync, isPending } = useAction(
    connectSendFox.bind(null, chatbotId),
  )

  const onSubmit = async (data: ConnectSendFoxSchema) => {
    const result = await executeAsync(data)

    if (result?.data?.success) {
      toast.success(
        t("messages.connectSuccess", {
          feature: t("sendFox.title"),
        }),
      )
      setOpen(false)
      form.reset()
      router.refresh()
    } else if (result?.serverError) {
      toast.error(result.serverError)
    }
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("sendFox.dialog.title")}</DialogTitle>
          <DialogDescription>
            {t("sendFox.dialog.description")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            className="space-y-4"
            id="connect-sendfox-form"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <FormField
              control={form.control}
              name="accessToken"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("sendFox.apiKey.label")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("sendFox.apiKey.placeholder")}
                      type="password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <DialogFooter>
          <Button onClick={() => setOpen(false)} type="button" variant="ghost">
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={isPending}
            form="connect-sendfox-form"
            type="submit"
          >
            {isPending && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
            {t("actions.connect")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
