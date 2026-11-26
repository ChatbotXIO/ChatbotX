"use client"

import {
  type TiktokPublishingCredentialPublic,
  type TiktokPublishingCredentialUpdate,
  tiktokPublishingCredentialUpdateSchema,
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
import { SiTiktok, SiTiktokHex } from "@icons-pack/react-simple-icons"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { CopyIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { useClipboard } from "@/hooks/use-clipboard"
import { CredentialFallbackNote } from "../credential-fallback-note"
import { DeleteCredentialDialog } from "../delete-credential-dialog"
import { useCredentialScope } from "../provider/credential-scope-context"
import { deleteTiktokPublishingSettingsAction } from "./delete-tiktok-publishing-settings.action"
import { updateTiktokPublishingSettingsAction } from "./update-tiktok-publishing-settings.action"

export function TiktokPublishingSettings({
  publicConfig,
  isInherited = false,
  callbackOrigin,
}: {
  publicConfig: TiktokPublishingCredentialPublic | null
  isInherited?: boolean
  callbackOrigin: string
}) {
  const t = useTranslations()
  const { handleCopy } = useClipboard()
  const authCallbackUrl = `${callbackOrigin}/integrations/tiktok/callback`

  return (
    <Card>
      <CardHeader className="items-center justify-center">
        <CardTitle className="flex items-center gap-2">
          <SiTiktok className="size-6 dark:fill-zinc-100" fill={SiTiktokHex} />
          <span>{t("fields.tiktokPublishing.label")}</span>
        </CardTitle>
        <CardAction>
          <EditDialog publicConfig={publicConfig} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {publicConfig?.clientId ? (
          <div className="flex flex-col gap-4">
            <Row
              label={t("fields.clientId.label")}
              onCopy={handleCopy}
              value={publicConfig.clientId}
            />
            <Row
              label={t("fields.authCallbackUrl.label")}
              onCopy={handleCopy}
              value={authCallbackUrl}
            />
          </div>
        ) : (
          <CredentialFallbackNote isInherited={isInherited} />
        )}
      </CardContent>
    </Card>
  )
}

function Row(props: {
  label: string
  value: string
  onCopy: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="font-bold">{props.label}:</div>
      <div className="flex items-center gap-2">
        <span className="truncate">{props.value}</span>
        <Button
          className="flex-none"
          onClick={() => props.onCopy(props.value)}
          size="icon"
          type="button"
          variant="outline"
        >
          <CopyIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function EditDialog({
  publicConfig,
}: {
  publicConfig: TiktokPublishingCredentialPublic | null
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
          {t("messages.editFeature", {
            feature: t("fields.tiktokPublishing.label"),
          })}
        </DialogTitle>
        <EditForm
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

function EditForm({
  publicConfig,
  onClose,
}: {
  publicConfig: TiktokPublishingCredentialPublic | null
  onClose?: () => void
}) {
  const t = useTranslations()
  const scope = useCredentialScope()
  const { form, handleSubmitWithAction } = useHookFormAction(
    updateTiktokPublishingSettingsAction.bind(null, scope),
    zodResolver(tiktokPublishingCredentialUpdateSchema),
    {
      actionProps: {
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
        onSuccess: () => onClose?.(),
      },
      formProps: {
        defaultValues: {
          clientId: publicConfig?.clientId ?? "",
          clientSecret: "",
        } satisfies TiktokPublishingCredentialUpdate,
        mode: "onChange",
      },
    },
  )
  const { execute: executeDelete, isPending: isDeleting } = useAction(
    deleteTiktokPublishingSettingsAction.bind(null, scope),
    {
      onError: ({ error }) =>
        error.serverError && toast.error(error.serverError),
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccess", {
            feature: t("fields.tiktokPublishing.label"),
          }),
        )
        onClose?.()
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
        <div className="flex justify-between gap-2">
          <DeleteCredentialDialog
            feature={t("fields.tiktokPublishing.label")}
            isDeleting={isDeleting}
            onConfirm={() => executeDelete()}
          />
          <Button type="submit">{t("actions.save")}</Button>
        </div>
      </form>
    </Form>
  )
}
