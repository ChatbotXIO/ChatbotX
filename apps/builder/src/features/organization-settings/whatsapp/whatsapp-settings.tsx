"use client"

import {
  type WhatsappCredentialPublic,
  type WhatsappCredentialUpdate,
  whatsappCredentialUpdateSchema,
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
import { SiWhatsapp, SiWhatsappHex } from "@icons-pack/react-simple-icons"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { CopyIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { updateWhatsappSettingsAction } from "./update-whatsapp-settings.action"

export function WhatsappSettings({
  publicConfig,
}: {
  publicConfig: WhatsappCredentialPublic | null
}) {
  const t = useTranslations()
  const [_, copy] = useCopyToClipboard()
  const [webhookUrl, setWebhookUrl] = useState<string>("")
  const [authCallbackUrl, setAuthCallbackUrl] = useState<string>("")
  useEffect(() => {
    setWebhookUrl(
      new URL(
        "/integrations/whatsapp/webhook",
        window.location.origin,
      ).toString(),
    )
    setAuthCallbackUrl(
      new URL(
        "/integrations/whatsapp/callback",
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
          <SiWhatsapp className="size-6" fill={SiWhatsappHex} />
          <span>WhatsApp</span>
        </CardTitle>
        <CardAction>
          <EditWhatsappSettingsDialog publicConfig={publicConfig} />
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

            {publicConfig.businessName && (
              <div className="flex flex-col gap-2">
                <div className="font-bold">Business Name:</div>
                <div className="flex items-center gap-2">
                  <span className="truncate">{publicConfig.businessName}</span>
                  <Button className="flex-none" size="icon" variant="outline">
                    <CopyIcon
                      className="size-4"
                      onClick={handleCopy(publicConfig.businessName)}
                    />
                  </Button>
                </div>
              </div>
            )}

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

export function EditWhatsappSettingsDialog({
  publicConfig,
}: {
  publicConfig: WhatsappCredentialPublic | null
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
          {t("messages.editFeature", { feature: "WhatsApp" })}
        </DialogTitle>

        <EditWhatsappSettingsForm
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

export function EditWhatsappSettingsForm({
  publicConfig,
  onClose,
}: {
  publicConfig: WhatsappCredentialPublic | null
  onClose?: () => void
}) {
  const t = useTranslations()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      updateWhatsappSettingsAction,
      zodResolver(whatsappCredentialUpdateSchema),
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
            version: publicConfig?.version ?? "v20.0",
            configId: publicConfig?.configId ?? "",
            systemUserId: publicConfig?.systemUserId ?? "",
            businessId: publicConfig?.businessId ?? "",
            businessName: publicConfig?.businessName ?? "",
            verifyToken: publicConfig?.verifyToken ?? "",
            clientSecret: "",
            systemUserToken: "",
          } satisfies WhatsappCredentialUpdate,
        },
      },
    )

  const isConfigured = publicConfig !== null
  const keepCurrentHint = isConfigured
    ? t("messages.leaveEmptyToKeepSecret")
    : undefined

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmitWithAction}>
        <InputField label={t("fields.appId.label")} name="clientId" required />

        <InputField
          description={keepCurrentHint}
          label={t("fields.appSecret.label")}
          name="clientSecret"
          required={!isConfigured}
          type="password"
        />

        <InputField
          label={t("fields.apiVersion.label")}
          name="version"
          required
        />

        <InputField
          label={t("fields.webhookVerifyToken.label")}
          name="verifyToken"
          required
        />

        <InputField
          label={t("fields.configId.label")}
          name="configId"
          required
        />

        <InputField
          label={t("fields.systemUserId.label")}
          name="systemUserId"
          required
        />

        <InputField
          description={keepCurrentHint}
          label={t("fields.systemUserToken.label")}
          name="systemUserToken"
          required={!isConfigured}
          type="password"
        />

        <InputField label={t("fields.businessId.label")} name="businessId" />

        <InputField
          label={t("fields.businessName.label")}
          name="businessName"
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
