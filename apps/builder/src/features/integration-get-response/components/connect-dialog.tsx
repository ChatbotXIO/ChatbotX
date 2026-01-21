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
import { connectGetResponse } from "../actions/connect.action"
import {
  type ConnectGetResponseSchema,
  connectGetResponseSchema,
} from "../schemas"

type GetResponseConnectDialogProps = {
  chatbotId: string
  children: ReactNode
  defaultValues?: Partial<ConnectGetResponseSchema>
}

export function GetResponseConnectDialog({
  chatbotId,
  children,
  defaultValues,
}: GetResponseConnectDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const form = useForm<ConnectGetResponseSchema>({
    resolver: zodResolver(connectGetResponseSchema),
    defaultValues: {
      apiKey: defaultValues?.apiKey ?? "",
    },
  })

  const { executeAsync, isPending } = useAction(
    connectGetResponse.bind(null, chatbotId),
  )

  async function onSubmit(data: ConnectGetResponseSchema) {
    const result = await executeAsync(data)

    if (result?.data?.success) {
      toast.success(
        t("messages.connectSuccess", {
          feature: t("getResponse.title"),
        }),
      )
      setOpen(false)
      router.refresh()
    } else if (result?.serverError) {
      toast.error(result.serverError)
    }
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>{t("getResponse.dialog.title")}</DialogTitle>
              <DialogDescription>
                {t("getResponse.dialog.description")}
              </DialogDescription>
            </DialogHeader>

            <FormField
              control={form.control}
              name="apiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("getResponse.apiKey.label")}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder={t("getResponse.apiKey.placeholder")}
                      type="password"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                onClick={() => setOpen(false)}
                type="button"
                variant="outline"
              >
                {t("actions.cancel")}
              </Button>
              <Button disabled={isPending} type="submit">
                {isPending && (
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t("actions.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
