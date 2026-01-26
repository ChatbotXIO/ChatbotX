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
import { connectMoosend } from "../actions/connect.action"
import { type ConnectMoosendSchema, connectMoosendSchema } from "../schemas"

type MoosendConnectDialogProps = {
  chatbotId: string
  children: ReactNode
}

export function MoosendConnectDialog({
  chatbotId,
  children,
}: MoosendConnectDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const form = useForm<ConnectMoosendSchema>({
    resolver: zodResolver(connectMoosendSchema),
    defaultValues: {
      apiKey: "",
    },
  })

  const { executeAsync, isPending } = useAction(
    connectMoosend.bind(null, chatbotId),
  )

  const onSubmit = async (data: ConnectMoosendSchema) => {
    const result = await executeAsync(data)

    if (result?.data?.success) {
      toast.success(
        t("messages.connectSuccess", {
          feature: t("moosend.title"),
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
          <DialogTitle>{t("moosend.dialog.title")}</DialogTitle>
          <DialogDescription>
            {t("moosend.dialog.description")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            className="space-y-4"
            id="connect-moosend-form"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <FormField
              control={form.control}
              name="apiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("moosend.apiKey.label")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("moosend.apiKey.placeholder")}
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
            form="connect-moosend-form"
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
