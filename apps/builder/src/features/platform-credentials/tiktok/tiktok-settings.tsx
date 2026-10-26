"use client"

import {
  TIKTOK_DEFAULT_CHANNEL_FEATURES,
  type TiktokCredentialPublic,
  type TiktokCredentialUpdate,
  tiktokCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
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
import { SiTiktok, SiTiktokHex } from "@icons-pack/react-simple-icons"
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
import { deleteTiktokSettingsAction } from "./delete-tiktok-settings.action"
import { updateTiktokSettingAction } from "./update-tiktok-settings.action"

export function TiktokSettings({
  publicConfig,
  isInherited = false,
  callbackOrigin,
  webhookUrl: webhookUrlOverride,
}: {
  publicConfig: TiktokCredentialPublic | null
  isInherited?: boolean
  /** Origin to register with TikTok. See `MessengerSettings`' equivalent prop. */
  callbackOrigin: string
  webhookUrl?: string
}) {
  const t = useTranslations()
  const { handleCopy } = useClipboard()
  const webhookUrl =
    webhookUrlOverride ?? `${callbackOrigin}/integrations/tiktok/webhook`
  const authCallbackUrl = `${callbackOrigin}/integrations/tiktok/callback`

  return (
    <Card>
      <CardHeader className="items-center justify-center">
        <CardTitle className="flex items-center gap-2">
          <SiTiktok className="size-6" fill={SiTiktokHex} />
          <span>TikTok</span>
        </CardTitle>
        <CardAction>
          <EditTiktokSettingsDialog publicConfig={publicConfig} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {publicConfig?.clientId ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col">
              <div className="font-bold">{t("fields.tiktok.clientId")}:</div>
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

            <TiktokFeaturesSummary features={publicConfig.features} />

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
          </div>
        ) : (
          <CredentialFallbackNote isInherited={isInherited} />
        )}
      </CardContent>
    </Card>
  )
}

export function EditTiktokSettingsDialog({
  publicConfig,
}: {
  publicConfig: TiktokCredentialPublic | null
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
          {t("messages.editFeature", { feature: "TikTok" })}
        </DialogTitle>

        <EditTiktokSettingsForm
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

export function EditTiktokSettingsForm({
  publicConfig,
  onClose,
}: {
  publicConfig: TiktokCredentialPublic | null
  onClose?: () => void
}) {
  const t = useTranslations()
  const scope = useCredentialScope()
  const { execute: executeDelete, isPending: isDeleting } = useAction(
    deleteTiktokSettingsAction.bind(null, scope),
    {
      onSuccess: () => {
        toast.success(t("messages.deletedSuccess", { feature: "TikTok" }))
        onClose?.()
      },
      onError: ({ error }) =>
        error.serverError && toast.error(error.serverError),
    },
  )

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      updateTiktokSettingAction.bind(null, scope),
      zodResolver(tiktokCredentialUpdateSchema),
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
            clientSecret: "",
            features: publicConfig?.features ?? TIKTOK_DEFAULT_CHANNEL_FEATURES,
          } satisfies TiktokCredentialUpdate,
        },
      },
    )

  // At least one feature must stay on, so the last one on cannot be switched
  // off — a credential serving neither would connect accounts that receive
  // nothing.
  const [messagingEnabled, commentsEnabled] = form.watch([
    "features.messaging",
    "features.comments",
  ])

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmitWithAction}>
        <InputField
          label={t("fields.tiktok.clientId")}
          name="clientId"
          required
        />

        <InputField
          label={t("fields.appSecret.label")}
          name="clientSecret"
          required
          type="password"
        />

        <div className="flex flex-col gap-3">
          <div className="font-medium text-sm">
            {t("fields.tiktok.features")}
          </div>
          <SwitchField
            description={t("fields.tiktok.featureMessagingDescription")}
            disabled={!commentsEnabled}
            label={t("fields.tiktok.featureMessaging")}
            name="features.messaging"
          />
          <SwitchField
            description={t("fields.tiktok.featureCommentsDescription")}
            disabled={!messagingEnabled}
            label={t("fields.tiktok.featureComments")}
            name="features.comments"
          />
          <p className="text-muted-foreground text-sm">
            {t("fields.tiktok.featuresReconnectHint")}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2">
          {publicConfig !== null && (
            <DeleteCredentialDialog
              disabled={form.formState.isSubmitting}
              feature="TikTok"
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

function TiktokFeaturesSummary({
  features = TIKTOK_DEFAULT_CHANNEL_FEATURES,
}: {
  features?: TiktokCredentialPublic["features"]
}) {
  const t = useTranslations()
  const enabledLabels = [
    features.messaging && t("fields.tiktok.featureMessaging"),
    features.comments && t("fields.tiktok.featureComments"),
  ].filter(Boolean)

  return (
    <div className="flex flex-col">
      <div className="font-bold">{t("fields.tiktok.features")}:</div>
      <span>{enabledLabels.join(", ")}</span>
    </div>
  )
}
