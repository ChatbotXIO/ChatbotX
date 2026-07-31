"use client"

import {
  type MakeCredentialPublic,
  type MakeCredentialUpdate,
  makeCredentialUpdateSchema,
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
import { SiMake, SiMakeHex } from "@icons-pack/react-simple-icons"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { CredentialFallbackNote } from "../credential-fallback-note"
import { useCredentialScope } from "../provider/credential-scope-context"
import { updateMakeSettingsAction } from "./update-make-settings.action"

export function MakeSettings({
  publicConfig,
  isInherited = false,
}: {
  publicConfig: MakeCredentialPublic | null
  isInherited?: boolean
}) {
  const t = useTranslations()

  return (
    <Card>
      <CardHeader className="items-center justify-center">
        <CardTitle className="flex items-center gap-2">
          <SiMake className="size-6" fill={SiMakeHex} />
          <span>Make</span>
        </CardTitle>
        <CardAction>
          <EditMakeSettingsDialog publicConfig={publicConfig} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {publicConfig?.inviteUrl ? (
          <div className="flex flex-col">
            <div className="font-bold">{t("fields.make.inviteUrl")}:</div>
            <a
              className="truncate text-primary underline"
              href={publicConfig.inviteUrl}
              rel="noreferrer"
              target="_blank"
            >
              {publicConfig.inviteUrl}
            </a>
          </div>
        ) : (
          <CredentialFallbackNote isInherited={isInherited} />
        )}
      </CardContent>
    </Card>
  )
}

export function EditMakeSettingsDialog({
  publicConfig,
}: {
  publicConfig: MakeCredentialPublic | null
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
          {t("messages.editFeature", { feature: "Make" })}
        </DialogTitle>

        <EditMakeSettingsForm
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

export function EditMakeSettingsForm({
  publicConfig,
  onClose,
}: {
  publicConfig: MakeCredentialPublic | null
  onClose?: () => void
}) {
  const t = useTranslations()
  const scope = useCredentialScope()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      updateMakeSettingsAction.bind(null, scope),
      zodResolver(makeCredentialUpdateSchema),
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
            inviteUrl: publicConfig?.inviteUrl ?? "",
          } satisfies MakeCredentialUpdate,
        },
      },
    )

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmitWithAction}>
        <InputField
          description={t("fields.make.inviteUrlHint")}
          label={t("fields.make.inviteUrl")}
          name="inviteUrl"
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
