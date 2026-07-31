"use client"

import {
  type GoogleCredentialPublic,
  type GoogleCredentialUpdate,
  googleCredentialUpdateSchema,
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
import { SiGoogle, SiGoogleHex } from "@icons-pack/react-simple-icons"
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
import { deleteGoogleSettingsAction } from "./delete-google-settings.action"
import { updateGoogleSettingsAction } from "./update-google-settings.action"

export function GoogleSettings({
  publicConfig,
  isInherited = false,
}: {
  publicConfig: GoogleCredentialPublic | null
  isInherited?: boolean
}) {
  const t = useTranslations()
  const { handleCopy } = useClipboard()

  // Both Google Sheets (integration) and Google sign-in (SSO) always redirect to
  // the fixed broker callback, regardless of the reseller's branded domain.
  // Resellers using their own Google app must whitelist these exact URIs in their
  // own Google console. See `oauth-broker.ts` / `oauth-referer.ts`.
  const authCallbackUrl = buildBrokerCallbackUrl(
    "/integrations/google/callback",
  )
  const signInCallbackUrl = buildBrokerCallbackUrl("/api/auth/callback/google")

  return (
    <Card>
      <CardHeader className="items-center justify-center">
        <CardTitle className="flex items-center gap-2">
          <SiGoogle className="size-6" fill={SiGoogleHex} />
          <span>Google</span>
        </CardTitle>
        <CardAction>
          <EditGoogleSettingsDialog publicConfig={publicConfig} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {publicConfig?.clientId ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col">
              <div className="font-bold">Client ID:</div>
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
              <div className="font-bold">Auth Callback URL:</div>
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
              <div className="font-bold">
                {t("fields.signInCallbackUrl.label")}:
              </div>
              <div className="flex items-center gap-2">
                <span className="truncate">{signInCallbackUrl}</span>
                <Button
                  className="flex-none"
                  onClick={() => handleCopy(signInCallbackUrl)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <CopyIcon className="size-4" />
                </Button>
              </div>
              <p className="text-muted-foreground text-sm">
                {t("fields.signInCallbackUrl.hint")}
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

export function EditGoogleSettingsDialog({
  publicConfig,
}: {
  publicConfig: GoogleCredentialPublic | null
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
          {t("messages.editFeature", { feature: "Google" })}
        </DialogTitle>

        <GoogleEditSettingsForm
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

export function GoogleEditSettingsForm({
  publicConfig,
  onClose,
}: {
  publicConfig: GoogleCredentialPublic | null
  onClose?: () => void
}) {
  const t = useTranslations()
  const scope = useCredentialScope()
  const { execute: executeDelete, isPending: isDeleting } = useAction(
    deleteGoogleSettingsAction.bind(null, scope),
    {
      onSuccess: () => {
        toast.success(t("messages.deletedSuccess", { feature: "Google" }))
        onClose?.()
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
      updateGoogleSettingsAction.bind(null, scope),
      zodResolver(googleCredentialUpdateSchema),
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
            verifyToken: "",
          } satisfies GoogleCredentialUpdate,
        },
      },
    )

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmitWithAction}>
        <InputField
          label={t("fields.clientId.label")}
          name="clientId"
          required
        />

        <InputField
          label={t("fields.clientSecret.label")}
          name="clientSecret"
          required
          type="password"
        />

        <InputField
          label={t("fields.verifyToken.label")}
          name="verifyToken"
          required
        />

        <div className="flex items-center justify-between gap-2">
          {publicConfig !== null && (
            <DeleteCredentialDialog
              disabled={form.formState.isSubmitting}
              feature="Google"
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
