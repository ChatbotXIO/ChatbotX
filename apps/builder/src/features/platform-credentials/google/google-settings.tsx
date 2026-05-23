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
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { updateGoogleSettingsAction } from "./update-google-settings.action"

export function GoogleSettings({
  publicConfig,
}: {
  publicConfig: GoogleCredentialPublic | null
}) {
  const t = useTranslations()
  const [_, copy] = useCopyToClipboard()
  const [authCallbackUrl, setAuthCallbackUrl] = useState<string>("")
  useEffect(() => {
    setAuthCallbackUrl(
      new URL(
        "/integrations/google/callback",
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
      <DialogTrigger asChild>
        <Button size="sm" type="button">
          {t("actions.edit")}
        </Button>
      </DialogTrigger>
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

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      updateGoogleSettingsAction,
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

  const isConfigured = publicConfig !== null
  const keepCurrentHint = isConfigured
    ? t("messages.leaveEmptyToKeepSecret")
    : undefined

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmitWithAction}>
        <InputField
          label={t("fields.clientId.label")}
          name="clientId"
          required
        />

        <InputField
          description={keepCurrentHint}
          label={t("fields.clientSecret.label")}
          name="clientSecret"
          required={!isConfigured}
          type="password"
        />

        <InputField
          description={keepCurrentHint}
          label={t("fields.verifyToken.label")}
          name="verifyToken"
          required={!isConfigured}
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
