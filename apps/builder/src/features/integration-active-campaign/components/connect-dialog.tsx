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
import { connectActiveCampaign } from "../actions/connect.action"
import {
  type ConnectActiveCampaignSchema,
  connectActiveCampaignSchema,
} from "../schemas"

type ActiveCampaignConnectDialogProps = {
  chatbotId: string
  children: ReactNode
  defaultValues?: Partial<ConnectActiveCampaignSchema>
}

export function ActiveCampaignConnectDialog({
  chatbotId,
  children,
  defaultValues,
}: ActiveCampaignConnectDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const form = useForm<ConnectActiveCampaignSchema>({
    resolver: zodResolver(connectActiveCampaignSchema),
    defaultValues: {
      apiUrl: defaultValues?.apiUrl ?? "",
      apiKey: defaultValues?.apiKey ?? "",
    },
  })

  const { executeAsync, isPending } = useAction(
    connectActiveCampaign.bind(null, chatbotId),
  )

  async function onSubmit(data: ConnectActiveCampaignSchema) {
    const result = await executeAsync(data)

    if (result?.data?.success) {
      toast.success(
        t("messages.connectSuccess", {
          feature: t("activeCampaign.title"),
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
              <DialogTitle>{t("activeCampaign.dialog.title")}</DialogTitle>
              <DialogDescription>
                {t("activeCampaign.dialog.description")}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <FormField
                control={form.control}
                name="apiUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("activeCampaign.apiUrl.label")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("activeCampaign.apiUrl.placeholder")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="apiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("activeCampaign.apiKey.label")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("activeCampaign.apiKey.placeholder")}
                        type="text"
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
