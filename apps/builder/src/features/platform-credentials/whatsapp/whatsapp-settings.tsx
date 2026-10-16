"use client"

import {
  type WhatsappCredentialPublic,
  type WhatsappCredentialUpdate,
  whatsappCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
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
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { zodResolver } from "@hookform/resolvers/zod"
import { SiWhatsapp, SiWhatsappHex } from "@icons-pack/react-simple-icons"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { CopyIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { useClipboard } from "@/hooks/use-clipboard"
import { CredentialFallbackNote } from "../credential-fallback-note"
import { DeleteCredentialDialog } from "../delete-credential-dialog"
import { useCredentialScope } from "../provider/credential-scope-context"
import { deleteWhatsappSettingsAction } from "./delete-whatsapp-settings.action"
import { updateWhatsappSettingsAction } from "./update-whatsapp-settings.action"

export function WhatsappSettings({
  publicConfig,
  isInherited = false,
  callbackOrigin,
}: {
  publicConfig: WhatsappCredentialPublic | null
  isInherited?: boolean
  /** Origin to register with Meta. See `MessengerSettings`' equivalent prop. */
  callbackOrigin: string
}) {
  const t = useTranslations()
  const { handleCopy } = useClipboard()
  const webhookUrl = `${callbackOrigin}/integrations/whatsapp/webhook`
  const authCallbackUrl = `${callbackOrigin}/integrations/whatsapp/callback`

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

            {publicConfig.businessName && (
              <div className="flex flex-col gap-2">
                <div className="font-bold">
                  {t("fields.businessName.label")}:
                </div>
                <div className="flex items-center gap-2">
                  <span className="truncate">{publicConfig.businessName}</span>
                  <Button
                    className="flex-none"
                    onClick={() => handleCopy(publicConfig.businessName)}
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    <CopyIcon className="size-4" />
                  </Button>
                </div>
              </div>
            )}

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
              <p className="text-muted-foreground text-sm">
                {t("fields.authCallbackUrl.hint")}
              </p>
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
              <p className="text-muted-foreground text-sm">
                {t("fields.webhookUrl.hint")}
              </p>
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
      <DialogTrigger
        render={
          <Button size="sm" type="button">
            {t("actions.edit")}
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
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

const SECRET_MASK = "••••••••••••"

export function EditWhatsappSettingsForm({
  publicConfig,
  onClose,
}: {
  publicConfig: WhatsappCredentialPublic | null
  onClose?: () => void
}) {
  const t = useTranslations()
  const scope = useCredentialScope()
  // Both secrets are required by the stored credential, so a saved public
  // config means they are set (they are never sent to the client).
  const hasStoredSecrets = publicConfig !== null

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      updateWhatsappSettingsAction.bind(null, scope),
      zodResolver(whatsappCredentialUpdateSchema),
      {
        actionProps: {
          onSuccess: ({ data }) => {
            if (data?.callsSubscriptionWarning) {
              toast.warning(data.callsSubscriptionWarning)
            }
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
            configId: publicConfig?.configId ?? "",
            systemUserId: publicConfig?.systemUserId ?? "",
            businessId: publicConfig?.businessId ?? "",
            businessName: publicConfig?.businessName ?? "",
            verifyToken: publicConfig?.verifyToken ?? "",
            clientSecret: "",
            systemUserToken: "",
            capiConfigId: publicConfig?.capiConfigId ?? "",
          } satisfies WhatsappCredentialUpdate,
        },
      },
    )

  const { execute: executeDelete, isPending: isDeleting } = useAction(
    deleteWhatsappSettingsAction.bind(null, scope),
    {
      onSuccess: () => {
        toast.success(t("messages.deletedSuccess", { feature: "WhatsApp" }))
        onClose?.()
      },
      onError: ({ error }) =>
        error.serverError && toast.error(error.serverError),
    },
  )

  const [clientSecret, systemUserToken] = form.watch([
    "clientSecret",
    "systemUserToken",
  ])
  const hasMissingSecret = !(
    hasStoredSecrets ||
    (clientSecret?.trim() && systemUserToken?.trim())
  )

  return (
    <Form {...form}>
      <form
        className="grid items-start gap-4 sm:grid-cols-2"
        onSubmit={handleSubmitWithAction}
      >
        <InputField label={t("fields.appId.label")} name="clientId" required />

        <SecretField
          isSet={hasStoredSecrets}
          label={t("fields.appSecret.label")}
          name="clientSecret"
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
          description={t("fields.capiConfigId.description")}
          label={t("fields.capiConfigId.label")}
          name="capiConfigId"
        />

        <InputField
          label={t("fields.systemUserId.label")}
          name="systemUserId"
          required
        />

        <SecretField
          isSet={hasStoredSecrets}
          label={t("fields.systemUserToken.label")}
          name="systemUserToken"
        />

        <InputField label={t("fields.businessId.label")} name="businessId" />

        <InputField
          label={t("fields.businessName.label")}
          name="businessName"
          required
        />

        <div className="flex items-center justify-between gap-2 sm:col-span-2">
          {publicConfig !== null && (
            <DeleteCredentialDialog
              disabled={form.formState.isSubmitting}
              feature="WhatsApp"
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
                hasMissingSecret ||
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

/**
 * A write-only secret input. The stored value never reaches the client, so the
 * mask is display-only: the form value stays empty (a blank submit keeps the
 * stored secret) and the mask disappears the moment the admin focuses the field
 * to type a new one, so asterisks can never be saved as the secret.
 */
function SecretField({
  name,
  label,
  isSet,
}: {
  name: "clientSecret" | "systemUserToken"
  label: string
  isSet: boolean
}) {
  const [isEditing, setIsEditing] = useState(false)

  return (
    <FormFieldWrapper label={label} name={name} required>
      {(field) => {
        const typed = typeof field.value === "string" ? field.value : ""
        return (
          <Input
            autoComplete="new-password"
            onBlur={() => {
              field.onBlur()
              setIsEditing(typed.length > 0)
            }}
            onChange={(event) => field.onChange(event.target.value)}
            onFocus={() => setIsEditing(true)}
            type="password"
            value={isSet && !isEditing && typed === "" ? SECRET_MASK : typed}
          />
        )
      }}
    </FormFieldWrapper>
  )
}
