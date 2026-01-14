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
import { connectDrip } from "../actions/connect.action"
import { type ConnectDripSchema, connectDripSchema } from "../schemas"

type DripConnectDialogProps = {
  chatbotId: string
  children: ReactNode
  defaultValues?: Partial<ConnectDripSchema>
}

export function DripConnectDialog({
  chatbotId,
  children,
  defaultValues,
}: DripConnectDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const form = useForm<ConnectDripSchema>({
    resolver: zodResolver(connectDripSchema),
    defaultValues: {
      apiToken: defaultValues?.apiToken ?? "",
    },
  })

  const { executeAsync, isPending } = useAction(
    connectDrip.bind(null, chatbotId),
  )

  async function onSubmit(data: ConnectDripSchema) {
    const result = await executeAsync(data)

    if (result?.data?.success) {
      toast.success(
        t("messages.connectSuccess", {
          feature: t("drip.title"),
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
              <DialogTitle>{t("drip.dialog.title")}</DialogTitle>
              <DialogDescription>
                {t("drip.dialog.description")}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <FormField
                control={form.control}
                name="apiToken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("drip.apiToken.label")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("drip.apiToken.placeholder")}
                        type="password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
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
