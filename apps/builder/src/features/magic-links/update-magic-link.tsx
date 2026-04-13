"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { toast } from "sonner"
import { updateMagicLinkAction } from "./actions/update-magic-link.action"
import { updateMagicLinkRequest } from "./schemas/action"
import type { MagicLinkResource } from "./schemas/resource"

type UpdateMagicLinkDialogProps = {
  workspaceId: string
  magicLink: MagicLinkResource | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const UpdateMagicLinkDialog = ({
  workspaceId,
  magicLink,
  open,
  onOpenChange,
}: UpdateMagicLinkDialogProps) => {
  const t = useTranslations()
  const router = useRouter()

  const onCompletedForm = () => {
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("messages.editFeature", {
              feature: t("fields.magicLink.label"),
            })}
          </DialogTitle>
        </DialogHeader>
        {magicLink ? (
          <UpdateMagicLinkForm
            magicLink={magicLink}
            onCompletedForm={onCompletedForm}
            workspaceId={workspaceId}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export const UpdateMagicLinkForm = (props: {
  workspaceId: string
  magicLink: MagicLinkResource
  onCompletedForm?: () => void
}) => {
  const { workspaceId, magicLink, onCompletedForm } = props
  const t = useTranslations()

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateMagicLinkAction.bind(null, workspaceId, magicLink.id),
    zodResolver(updateMagicLinkRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("magicLinks.title"),
            }),
          )
          onCompletedForm?.()
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
          name: magicLink.name,
          url: magicLink.url,
        },
      },
    },
  )

  useEffect(() => {
    form.reset({
      name: magicLink.name,
      url: magicLink.url,
    })
  }, [magicLink, form])

  return (
    <Form {...form}>
      <form
        className="flex flex-1 flex-col space-y-6"
        onSubmit={handleSubmitWithAction}
      >
        <InputField
          description={t("fields.magicLink.nameHint", { workspaceId })}
          label={t("fields.name.label")}
          name="name"
          required
        />

        <TextareaField
          description={t("fields.magicLink.urlHint")}
          label={t("fields.url.label")}
          name="url"
          placeholder="https://example.com/page?utm_campaign={{campaign}}"
          required
          rows={3}
        />

        <div className="flex justify-end gap-2">
          <Button onClick={onCompletedForm} type="button" variant="ghost">
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={!form.formState.isValid || form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting && (
              <Loader2Icon aria-hidden className="animate-spin" />
            )}
            {t("actions.save")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
