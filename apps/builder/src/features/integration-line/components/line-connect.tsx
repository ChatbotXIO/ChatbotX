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
import type { ReactElement } from "react"
import { useState } from "react"
import { toast } from "sonner"
import { useInvalidateInboxes } from "@/features/inboxes/provider/inbox-hook"
import { connectLineAction } from "../actions/connect.action"
import type { ConnectLineResult } from "../lib/connect-line"
import { connectLineActionRequest } from "../schema/action"

type Notices = {
  workspaceId: string
  webhook: ConnectLineResult["webhook"]
}

export function LineConnect({
  workspaceId,
  children,
  autoOpen = false,
}: {
  workspaceId?: string | null
  children?: ReactElement
  autoOpen?: boolean
}) {
  const t = useTranslations()
  const tLine = useTranslations("integrationLine")
  const router = useRouter()
  const invalidateInboxes = useInvalidateInboxes()
  const [open, setOpen] = useState(autoOpen)
  const [notices, setNotices] = useState<Notices | null>(null)

  const goToChannel = (targetWorkspaceId: string | null) => {
    if (targetWorkspaceId) {
      router.push(`/space/${targetWorkspaceId}/settings/channels/line`)
    } else {
      router.push("/")
    }
  }

  const { form, handleSubmitWithAction } = useHookFormAction(
    connectLineAction,
    zodResolver(connectLineActionRequest),
    {
      actionProps: {
        onSuccess: ({ data }) => {
          if (!data) {
            return
          }
          switch (data.errorCode) {
            case "channelHidden":
              toast.error(tLine("errors.channelHidden"))
              return
            case "connectionCredentialsRejected":
              toast.error(tLine("errors.credentialsRejected"))
              return
            case "lineWebhookRejected":
              toast.error(tLine("errors.webhookRejected"))
              return
            case "connectionProviderUnavailable":
              toast.error(tLine("errors.providerUnavailable"))
              return
            default:
              break
          }
          invalidateInboxes()
          const needsAttention =
            !(data.webhook.active && data.webhook.testOk) ||
            data.webhook.previousWebhookUrl !== null
          if (needsAttention && data.workspaceId && data.webhook) {
            setNotices({ workspaceId: data.workspaceId, webhook: data.webhook })
            return
          }
          setOpen(false)
          goToChannel(data.workspaceId)
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
          channelId: "",
          channelSecret: "",
          workspaceId,
        },
      },
    },
  )

  if (notices) {
    const { webhook } = notices
    return (
      <Dialog
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) {
            goToChannel(notices.workspaceId)
          }
        }}
        open={open}
      >
        <DialogTrigger render={children} />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("fields.line.label")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 text-sm">
            {!(webhook.active && webhook.testOk) && (
              <p className="text-destructive">{tLine("webhookNotEnabled")}</p>
            )}
            {webhook.previousWebhookUrl && (
              <p className="text-muted-foreground">
                {tLine("webhookReplaced", { url: webhook.previousWebhookUrl })}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setOpen(false)
                goToChannel(notices.workspaceId)
              }}
              type="button"
            >
              {tLine("continue")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={children} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("actions.addFeature", { feature: t("fields.line.label") })}
          </DialogTitle>
          <DialogDescription>{tLine("credentialsHelp")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={handleSubmitWithAction}
          >
            <InputField name="workspaceId" type="hidden" />
            <InputField
              label={tLine("channelIdLabel")}
              name="channelId"
              required
            />
            <InputField
              label={tLine("channelSecretLabel")}
              name="channelSecret"
              required
              type="password"
            />
            <DialogFooter>
              <DialogClose
                render={
                  <Button type="button" variant="secondary">
                    {t("actions.cancel")}
                  </Button>
                }
              />
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
