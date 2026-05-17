"use client"

import {
  type MessengerCredentialPublic,
  type MessengerCredentialUpdate,
  messengerCredentialUpdateSchema,
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
import { SiMessenger, SiMessengerHex } from "@icons-pack/react-simple-icons"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { CopyIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { updateMessengerSettingAction } from "./update-messenger-settings.action"

export function MessengerSettings({
  publicConfig,
}: {
  publicConfig: MessengerCredentialPublic | null
}) {
  const t = useTranslations()
  const [_, copy] = useCopyToClipboard()
  const [webhookUrl, setWebhookUrl] = useState<string>("")
  const [authCallbackUrl, setAuthCallbackUrl] = useState<string>("")
  useEffect(() => {
    setWebhookUrl(
      new URL(
        "/integrations/messenger/webhook",
        window.location.origin,
      ).toString(),
    )
    setAuthCallbackUrl(
      new URL(
        "/integrations/messenger/callback",
        window.location.origin,
      ).toString(),
    )
  }, [])

  const handleCopy = (text: string) => () => {
    copy(text)
      .then(() => {
        toast.success("Copied to clipboard")
      })
      .catch((error) => {
        console.error("Failed to copy!", error)
      })
  }

  return (
    <Card>
      <CardHeader className="items-center justify-center">
        <CardTitle className="flex items-center gap-2">
          <SiMessenger className="size-6" fill={SiMessengerHex} />
          <span>Messenger</span>
        </CardTitle>
        <CardAction>
          <EditMessengerSettingsDialog publicConfig={publicConfig} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {publicConfig?.clientId ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col">
              <div className="font-bold">App ID:</div>
              <div className="flex items-center gap-2">
                <span className="truncate">{publicConfig.clientId}</span>
                <Button className="flex-none" size="icon" variant="outline">
                  <CopyIcon
                    className="size-4"
                    onClick={handleCopy(publicConfig.clientId)}
                  />
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="font-bold">Auth Callback URL:</div>
              <div className="flex items-center gap-2">
                <span className="truncate">{authCallbackUrl}</span>
                <Button className="flex-none" size="icon" variant="outline">
                  <CopyIcon
                    className="size-4"
                    onClick={handleCopy(authCallbackUrl)}
                  />
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="font-bold">Webhook URL:</div>
              <div className="flex items-center gap-2">
                <span className="truncate">{webhookUrl}</span>
                <Button className="flex-none" size="icon" variant="outline">
                  <CopyIcon
                    className="size-4"
                    onClick={handleCopy(webhookUrl)}
                  />
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="font-bold">Webhook Verify Token:</div>
              <div className="flex items-center gap-2">
                <span className="truncate">{publicConfig.verifyToken}</span>
                <Button className="flex-none" size="icon" variant="outline">
                  <CopyIcon
                    className="size-4"
                    onClick={handleCopy(publicConfig.verifyToken)}
                  />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("messages.needToAddSettings")}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export function EditMessengerSettingsDialog({
  publicConfig,
}: {
  publicConfig: MessengerCredentialPublic | null
}) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" type="button">
          {t("actions.edit")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>
          {t("messages.editFeature", { feature: "Messenger" })}
        </DialogTitle>

        <EditMessengerSettingsForm
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

export function EditMessengerSettingsForm({
  publicConfig,
  onClose,
}: {
  publicConfig: MessengerCredentialPublic | null
  onClose?: () => void
}) {
  const t = useTranslations()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      updateMessengerSettingAction,
      zodResolver(messengerCredentialUpdateSchema),
      {
        actionProps: {
          onSuccess: () => {
            onClose?.()
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
            clientId: publicConfig?.clientId ?? "",
            version: publicConfig?.version ?? "v25.0",
            verifyToken: publicConfig?.verifyToken ?? "",
            clientSecret: "",
          } satisfies MessengerCredentialUpdate,
        },
      },
    )

  const isConfigured = publicConfig !== null

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmitWithAction}>
        <InputField label={t("fields.appId.label")} name="clientId" required />

        <InputField
          description={
            isConfigured ? t("messages.leaveEmptyToKeepSecret") : undefined
          }
          label={t("fields.appSecret.label")}
          name="clientSecret"
          required={!isConfigured}
          type="password"
        />

        <InputField
          label={t("fields.webhookVerifyToken.label")}
          name="verifyToken"
          required
        />

        <InputField
          label={t("fields.apiVersion.label")}
          name="version"
          required
        />

        <div className="flex justify-end gap-2">
          <Button
            onClick={() => {
              resetFormAndAction()
              onClose?.()
            }}
            type="button"
            variant="outline"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={!form.formState.isValid || form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting && (
              <Loader2Icon className="size-4 animate-spin" />
            )}
            {t("actions.save")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
