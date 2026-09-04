"use client"

import {
  type ThreadsCredentialPublic,
  type ThreadsCredentialUpdate,
  threadsCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { SiThreads, SiThreadsHex } from "@icons-pack/react-simple-icons"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { CopyIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { useClipboard } from "@/hooks/use-clipboard"
import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"
import { CredentialFallbackNote } from "../credential-fallback-note"
import { DeleteCredentialDialog } from "../delete-credential-dialog"
import { useCredentialScope } from "../provider/credential-scope-context"
import { deleteThreadsSettingsAction } from "./delete-threads-settings.action"
import { updateThreadsSettingAction } from "./update-threads-settings.action"
import { buildThreadsWebhookUrl } from "./webhook-url"

export function ThreadsSettings({
  publicConfig,
  isInherited = false,
}: {
  publicConfig: ThreadsCredentialPublic | null
  isInherited?: boolean
}) {
  const t = useTranslations()
  const { handleCopy } = useClipboard()
  const webhookUrl = buildThreadsWebhookUrl(publicConfig?.clientId)
  const authCallbackUrl = buildBrokerCallbackUrl(
    "/integrations/threads/callback",
  )

  return (
    <Card>
      <CardHeader className="items-center justify-center">
        <CardTitle className="flex items-center gap-2">
          <SiThreads className="size-6" fill={SiThreadsHex} />
          <span>{t("fields.threads.label")}</span>
        </CardTitle>
        <CardAction>
          <EditThreadsSettingsDialog publicConfig={publicConfig} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {publicConfig?.clientId ? (
          <div className="flex flex-col gap-4">
            <CredentialRow
              label={t("fields.appId.label")}
              onCopy={handleCopy}
              value={publicConfig.clientId}
            />
            <CredentialRow
              label={t("fields.authCallbackUrl.label")}
              onCopy={handleCopy}
              value={authCallbackUrl}
            />
            <CredentialRow
              label={t("fields.webhookUrl.label")}
              onCopy={handleCopy}
              value={webhookUrl}
            />
            <CredentialRow
              label={t("fields.webhookVerifyToken.label")}
              onCopy={handleCopy}
              value={publicConfig.verifyToken}
            />
          </div>
        ) : (
          <CredentialFallbackNote isInherited={isInherited} />
        )}
      </CardContent>
    </Card>
  )
}

function CredentialRow(props: {
  label: string
  value: string
  onCopy: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="font-bold">{props.label}:</div>
      <div className="flex items-center gap-2">
        <span className="truncate">{props.value}</span>
        <Button
          className="flex-none"
          onClick={() => props.onCopy(props.value)}
          size="icon"
          type="button"
          variant="outline"
        >
          <CopyIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function EditThreadsSettingsDialog({
  publicConfig,
}: {
  publicConfig: ThreadsCredentialPublic | null
}) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button size="sm" type="button">
            {t("actions.edit")}
          </Button>
        }
      />
      <DialogContent>
        <DialogTitle>
          {t("messages.editFeature", { feature: t("fields.threads.label") })}
        </DialogTitle>
        <EditThreadsSettingsForm
          onClose={() => {
            setOpen(false)
            router.refresh()
          }}
          publicConfig={publicConfig}
        />
      </DialogContent>
    </Dialog>
  )
}

function EditThreadsSettingsForm({
  publicConfig,
  onClose,
}: {
  publicConfig: ThreadsCredentialPublic | null
  onClose?: () => void
}) {
  const t = useTranslations()
  const scope = useCredentialScope()
  const { form, handleSubmitWithAction } = useHookFormAction(
    updateThreadsSettingAction.bind(null, scope),
    zodResolver(threadsCredentialUpdateSchema),
    {
      actionProps: {
        onSuccess: () => onClose?.(),
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          clientId: publicConfig?.clientId ?? "",
          version: publicConfig?.version ?? "v1.0",
          verifyToken: publicConfig?.verifyToken ?? "",
          clientSecret: "",
        } satisfies ThreadsCredentialUpdate,
      },
    },
  )

  const { execute: executeDelete, isPending: isDeleting } = useAction(
    deleteThreadsSettingsAction.bind(null, scope),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccess", { feature: t("fields.threads.label") }),
        )
        onClose?.()
      },
      onError: ({ error }) =>
        error.serverError && toast.error(error.serverError),
    },
  )

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmitWithAction}>
        <InputField label={t("fields.appId.label")} name="clientId" required />
        <InputField
          label={t("fields.appSecret.label")}
          name="clientSecret"
          required
          type="password"
        />
        <InputField label={t("fields.version.label")} name="version" required />
        <InputField
          label={t("fields.webhookVerifyToken.label")}
          name="verifyToken"
          required
        />
        <div className="flex justify-between gap-2">
          <DeleteCredentialDialog
            feature={t("fields.threads.label")}
            isDeleting={isDeleting}
            onConfirm={() => executeDelete()}
          />
          <Button type="submit">{t("actions.save")}</Button>
        </div>
      </form>
    </Form>
  )
}
