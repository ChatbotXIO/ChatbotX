"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { createMagicLinkAction } from "./actions/create-magic-link.action"
import { createMagicLinkRequest } from "./schemas/action"

export const CreateMagicLinkDialog = ({
  workspaceId,
}: {
  workspaceId: string
}) => {
  const t = useTranslations()
  const router = useRouter()

  const [open, setOpen] = useState(false)

  const onCompletedForm = () => {
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" type="button">
          <PlusIcon aria-hidden className="size-4" />
          {t("actions.createFeature", { feature: t("magicLinks.title") })}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("messages.createFeature", {
              feature: t("fields.magicLink.label"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <CreateMagicLinkForm
          onCompletedForm={onCompletedForm}
          workspaceId={workspaceId}
        />
      </DialogContent>
    </Dialog>
  )
}

export const CreateMagicLinkForm = ({
  workspaceId,
  onCompletedForm,
}: {
  workspaceId: string
  onCompletedForm?: () => void
}) => {
  const t = useTranslations()

  const { form, handleSubmitWithAction } = useHookFormAction(
    createMagicLinkAction.bind(null, workspaceId),
    zodResolver(createMagicLinkRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.createdSuccess", {
              feature: t("fields.magicLink.label"),
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
          name: "",
          url: "",
        },
      },
    },
  )

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

        <TiptapEditorField
          description={t("fields.magicLink.urlHint")}
          label={t("fields.url.label")}
          name="url"
          placeholder="https://example.com/page?utm_campaign={{campaign}}"
          required
          showEmojiPicker={false}
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
            {t("actions.create")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
