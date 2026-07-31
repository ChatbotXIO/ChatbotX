"use client"

import {
  type ZaloCredentialPublic,
  type ZaloCredentialUpdate,
  zaloCredentialUpdateSchema,
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
import { SiZalo, SiZaloHex } from "@icons-pack/react-simple-icons"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { CopyIcon, Loader2Icon } from "lucide-react"
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
import { deleteZaloSettingsAction } from "./delete-zalo-settings.action"
import { updateZaloSettingsAction } from "./update-zalo-settings.action"

export function ZaloSettings({
  publicConfig,
  isInherited = false,
}: {
  publicConfig: ZaloCredentialPublic | null
  isInherited?: boolean
}) {
  const t = useTranslations()
  const { handleCopy } = useClipboard()
  // Webhook + OAuth callback URLs must live on the fixed, provider-registered
  // broker host — never the reseller's white-label custom domain, which Zalo
  // cannot reach. Resellers using their own Zalo app whitelist these URIs.
  const webhookUrl = buildBrokerCallbackUrl("/integrations/zalo/webhook")
  const authCallbackUrl = buildBrokerCallbackUrl("/integrations/zalo/callback")

  return (
    <Card>
      <CardHeader className="items-center justify-center">
        <CardTitle className="flex items-center gap-2">
          <SiZalo className="size-6" fill={SiZaloHex} />
          <span>Zalo</span>
        </CardTitle>
        <CardAction>
          <EditZaloSettingsDialog publicConfig={publicConfig} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {publicConfig?.clientId ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col">
              <div className="font-bold">{t("fields.appId.label")}:</div>
              <div className="flex items-center gap-2">
                <span className="truncate">{publicConfig.clientId}</span>
                <Button
                  className="flex-none"
                  onClick={() => handleCopy(publicConfig.clientId)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <CopyIcon className="size-4" />
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="font-bold">
                {t("fields.authCallbackUrl.label")}:
              </div>
              <div className="flex items-center gap-2">
                <span className="truncate">{authCallbackUrl}</span>
                <Button
                  className="flex-none"
                  onClick={() => handleCopy(authCallbackUrl)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <CopyIcon className="size-4" />
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="font-bold">{t("fields.webhookUrl.label")}:</div>
              <div className="flex items-center gap-2">
                <span className="truncate">{webhookUrl}</span>
                <Button
                  className="flex-none"
                  onClick={() => handleCopy(webhookUrl)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <CopyIcon className="size-4" />
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="font-bold">
                {t("fields.webhookVerifyToken.label")}:
              </div>
              <div className="flex items-center gap-2">
                <span className="truncate">{publicConfig.verifyToken}</span>
                <Button
                  className="flex-none"
                  onClick={() => handleCopy(publicConfig.verifyToken)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <CopyIcon className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <CredentialFallbackNote isInherited={isInherited} />
        )}
      </CardContent>
    </Card>
  )
}

export function EditZaloSettingsDialog({
  publicConfig,
}: {
  publicConfig: ZaloCredentialPublic | null
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
          {t("messages.editFeature", { feature: "Zalo" })}
        </DialogTitle>

        <EditZaloSettingsForm
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

export function EditZaloSettingsForm({
  publicConfig,
  onClose,
}: {
  publicConfig: ZaloCredentialPublic | null
  onClose?: () => void
}) {
  const t = useTranslations()
  const scope = useCredentialScope()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      updateZaloSettingsAction.bind(null, scope),
      zodResolver(zaloCredentialUpdateSchema),
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
            version: publicConfig?.version ?? "v2.0",
            verifyToken: publicConfig?.verifyToken ?? "",
            clientSecret: "",
          } satisfies ZaloCredentialUpdate,
        },
      },
    )

  const { execute: executeDelete, isPending: isDeleting } = useAction(
    deleteZaloSettingsAction.bind(null, scope),
    {
      onSuccess: () => {
        toast.success(t("messages.deletedSuccess", { feature: "Zalo" }))
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

        <div className="flex items-center justify-between gap-2">
          {publicConfig !== null && (
            <DeleteCredentialDialog
              disabled={form.formState.isSubmitting}
              feature="Zalo"
              isDeleting={isDeleting}
              onConfirm={() => executeDelete()}
            />
          )}
          <div className="ms-auto flex gap-2">
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
              disabled={
                !form.formState.isValid ||
                form.formState.isSubmitting ||
                isDeleting
              }
              type="submit"
            >
              {form.formState.isSubmitting && (
                <Loader2Icon className="size-4 animate-spin" />
              )}
              {t("actions.save")}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  )
}
