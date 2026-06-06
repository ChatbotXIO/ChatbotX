"use client"

import {
  type GiphyCredentialUpdate,
  giphyCredentialUpdateSchema,
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
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { useCredentialScope } from "../provider/credential-scope-context"
import { updateGiphySettingsAction } from "./update-giphy-settings.action"

export function GiphySettings({ isConfigured }: { isConfigured: boolean }) {
  const t = useTranslations()

  return (
    <Card>
      <CardHeader className="items-center justify-center">
        <CardTitle className="flex items-center gap-2">
          <span className="font-semibold text-lg">GIPHY</span>
        </CardTitle>
        <CardAction>
          <EditGiphySettingsDialog isConfigured={isConfigured} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {isConfigured ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col">
              <div className="font-bold">{t("fields.apiKey.label")}:</div>
              <div className="flex items-center gap-2">
                <span className="truncate">••••••••</span>
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

export function EditGiphySettingsDialog({
  isConfigured,
}: {
  isConfigured: boolean
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
          {t("messages.editFeature", { feature: "GIPHY" })}
        </DialogTitle>

        <EditGiphySettingsForm
          isConfigured={isConfigured}
          onClose={() => {
            setOpen(false)
            router.refresh()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

export function EditGiphySettingsForm({
  isConfigured,
  onClose,
}: {
  isConfigured: boolean
  onClose?: () => void
}) {
  const t = useTranslations()
  const scope = useCredentialScope()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      updateGiphySettingsAction.bind(null, scope),
      zodResolver(giphyCredentialUpdateSchema),
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
            apiKey: "",
          } satisfies GiphyCredentialUpdate,
        },
      },
    )

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmitWithAction}>
        <InputField
          description={
            isConfigured ? t("messages.leaveEmptyToKeepSecret") : undefined
          }
          label={t("fields.apiKey.label")}
          name="apiKey"
          required={!isConfigured}
          type="password"
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
