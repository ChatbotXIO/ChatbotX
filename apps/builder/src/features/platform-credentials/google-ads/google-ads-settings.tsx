"use client"

import {
  type GoogleAdsCredentialPublic,
  type GoogleAdsCredentialUpdate,
  googleAdsCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { useFormOptionalLabel } from "@chatbotx.io/ui/components/form/optional-label-context"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@chatbotx.io/ui/components/ui/form"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { zodResolver } from "@hookform/resolvers/zod"
import { SiGoogleads, SiGoogleadsHex } from "@icons-pack/react-simple-icons"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { CopyIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { useFormContext } from "react-hook-form"
import { toast } from "sonner"
import { useClipboard } from "@/hooks/use-clipboard"
import { CredentialFallbackNote } from "../credential-fallback-note"
import { DeleteCredentialDialog } from "../delete-credential-dialog"
import { useCredentialScope } from "../provider/credential-scope-context"
import { clearGoogleAdsDeveloperTokenAction } from "./clear-google-ads-developer-token.action"
import { deleteGoogleAdsSettingsAction } from "./delete-google-ads-settings.action"
import { updateGoogleAdsSettingsAction } from "./update-google-ads-settings.action"

export function GoogleAdsSettings({
  publicConfig,
  isInherited = false,
  callbackOrigin,
}: {
  publicConfig: GoogleAdsCredentialPublic | null
  isInherited?: boolean
  /** Origin to register with Google. See `MessengerSettings`' equivalent prop. */
  callbackOrigin: string
}) {
  const t = useTranslations()
  const { handleCopy } = useClipboard()
  const authCallbackUrl = `${callbackOrigin}/integrations/google-ads/callback`

  return (
    <Card>
      <CardHeader className="items-center justify-center">
        <CardTitle className="flex items-center gap-2">
          <SiGoogleads className="size-6" fill={SiGoogleadsHex} />
          <span>Google Ads</span>
        </CardTitle>
        <CardAction>
          <EditGoogleAdsSettingsDialog publicConfig={publicConfig} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {publicConfig?.clientId ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col">
              <div className="font-bold">{t("fields.clientId.label")}:</div>
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

            <div className="flex flex-col">
              <div className="font-bold">
                {t("fields.adsUploadMethod.label")}:
              </div>
              <span>
                {t(
                  `fields.adsUploadMethod.${publicConfig.uploadMethod ?? "dataManager"}`,
                )}
              </span>
            </div>

            <div className="flex flex-col">
              <div className="font-bold">
                {t("fields.adsDeveloperToken.label")}:
              </div>
              <span>
                {publicConfig.hasDeveloperToken
                  ? t("fields.adsDeveloperToken.isSet")
                  : t("fields.adsDeveloperToken.isNotSet")}
              </span>
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
              <p className="text-muted-foreground text-sm">
                {t("fields.googleAdsCallbackUrl.hint")}
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

export function EditGoogleAdsSettingsDialog({
  publicConfig,
}: {
  publicConfig: GoogleAdsCredentialPublic | null
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
          {t("messages.editFeature", { feature: "Google Ads" })}
        </DialogTitle>

        <EditGoogleAdsSettingsForm
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

export function EditGoogleAdsSettingsForm({
  publicConfig,
  onClose,
}: {
  publicConfig: GoogleAdsCredentialPublic | null
  onClose?: () => void
}) {
  const t = useTranslations()
  const scope = useCredentialScope()
  const router = useRouter()
  // The client id and secret are required by the stored credential, so a saved
  // public config means the secret is set (it is never sent to the client).
  const hasStoredSecrets = publicConfig !== null
  const { execute: executeDelete, isPending: isDeleting } = useAction(
    deleteGoogleAdsSettingsAction.bind(null, scope),
    {
      onSuccess: () => {
        toast.success(t("messages.deletedSuccess", { feature: "Google Ads" }))
        onClose?.()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const { execute: executeClear, isPending: isClearing } = useAction(
    clearGoogleAdsDeveloperTokenAction.bind(null, scope),
    {
      onSuccess: () => {
        toast.success(t("fields.adsDeveloperToken.cleared"))
        form.setValue("developerToken", "")
        router.refresh()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      updateGoogleAdsSettingsAction.bind(null, scope),
      zodResolver(googleAdsCredentialUpdateSchema),
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
            developerToken: "",
            uploadMethod: publicConfig?.uploadMethod ?? "dataManager",
          } satisfies GoogleAdsCredentialUpdate,
        },
      },
    )

  const hasDeveloperToken = publicConfig?.hasDeveloperToken === true
  const clientSecret = form.watch("clientSecret")
  const hasMissingSecret = !(hasStoredSecrets || clientSecret?.trim())
  const uploadMethodOptions = [
    {
      value: "dataManager",
      label: t("fields.adsUploadMethod.dataManager"),
    },
    { value: "legacy", label: t("fields.adsUploadMethod.legacy") },
  ]

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmitWithAction}>
        <InputField
          label={t("fields.clientId.label")}
          name="clientId"
          required
        />

        <div className="flex flex-col gap-2">
          <InputField
            description={t("fields.clientSecret.keepHint")}
            label={t("fields.clientSecret.label")}
            name="clientSecret"
            required
            type="password"
          />
          <span className="text-muted-foreground text-sm">
            {hasStoredSecrets
              ? t("fields.clientSecret.isSet")
              : t("fields.clientSecret.isNotSet")}
          </span>
        </div>

        <SelectField
          description={t("fields.adsUploadMethod.hint")}
          label={t("fields.adsUploadMethod.label")}
          name="uploadMethod"
          options={uploadMethodOptions}
          required
        />

        <div className="flex flex-col gap-2">
          <DeveloperTokenField
            hasDeveloperToken={hasDeveloperToken}
            isClearing={isClearing}
            onClear={() => executeClear()}
          />
          <span className="text-muted-foreground text-sm">
            {hasDeveloperToken
              ? t("fields.adsDeveloperToken.isSet")
              : t("fields.adsDeveloperToken.isNotSet")}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          {publicConfig !== null && (
            <DeleteCredentialDialog
              disabled={form.formState.isSubmitting}
              feature="Google Ads"
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
                isDeleting ||
                isClearing
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
 * The developer token input with a "Clear" button on the label row. Built from
 * the form primitives because `InputField` cannot host a trailing label slot.
 */
function DeveloperTokenField({
  hasDeveloperToken,
  isClearing,
  onClear,
}: {
  hasDeveloperToken: boolean
  isClearing: boolean
  onClear: () => void
}) {
  const t = useTranslations()
  const optionalLabel = useFormOptionalLabel()
  const { control } = useFormContext()

  return (
    <FormField
      control={control}
      name="developerToken"
      render={({ field }) => (
        <FormItem className="w-full">
          <div className="flex items-center justify-between gap-2">
            <FormLabel className="flex items-center gap-1">
              {t("fields.adsDeveloperToken.label")}
              <span className="self-start font-normal text-xxs">
                {optionalLabel}
              </span>
            </FormLabel>
            {hasDeveloperToken && (
              <Button
                disabled={isClearing}
                onClick={onClear}
                size="sm"
                type="button"
                variant="ghost"
              >
                {isClearing && <Loader2Icon className="size-4 animate-spin" />}
                {t("fields.adsDeveloperToken.clear")}
              </Button>
            )}
          </div>
          <FormControl>
            <Input type="password" {...field} value={field.value ?? ""} />
          </FormControl>
          <FormDescription>
            {t("fields.adsDeveloperToken.hint")}
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
