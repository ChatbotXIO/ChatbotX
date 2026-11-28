"use client"

import type { TagModel } from "@chatbotx.io/database/types"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@chatbotx.io/ui/components/ui/form"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { toast } from "sonner"
import { LockedDialogFieldset } from "@/components/locked-dialog-fieldset"
import { useInvalidateTags } from "@/features/tags/provider/tag-hook"
import { useIsLocked } from "@/features/templates/components/lock-context"
import { updateTagAction } from "./actions/update-tag-action"
import {
  buildUpdateTagPayload,
  isEmptyUpdateTagPayload,
} from "./lib/update-tag-payload"
import { updateTagSchema } from "./schema/action"
import { TagColorField } from "./tag-color-field"
import {
  TAG_DIALOG_BODY_CLASS,
  TAG_DIALOG_CANCEL_CLASS,
  TAG_DIALOG_CONFIRM_CLASS,
  TAG_DIALOG_CONTENT_CLASS,
  TAG_DIALOG_FIELD_CLASS,
  TAG_DIALOG_FOOTER_CLASS,
  TAG_DIALOG_FORM_CLASS,
  TAG_DIALOG_HEADER_CLASS,
  TAG_DIALOG_INPUT_CLASS,
  TAG_DIALOG_TITLE_CLASS,
} from "./tag-dialog-styles"

export function UpdateTagDialog({
  workspaceId,
  tag,
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  workspaceId: string
  tag: TagModel | null
}) {
  const t = useTranslations()
  const isLocked = useIsLocked(tag?.id)
  const router = useRouter()
  const invalidateTags = useInvalidateTags()

  const {
    form,
    action,
    resetFormAndAction,
    form: { reset },
  } = useHookFormAction(
    updateTagAction.bind(null, workspaceId, tag?.id ?? ""),
    zodResolver(updateTagSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.tag.label"),
            }),
          )
          resetFormAndAction()
          onOpenChange(false)
          router.refresh()
          invalidateTags()
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
      },
      errorMapProps: {},
    },
  )

  useEffect(() => {
    if (tag) {
      // Real defaults, so `dirtyFields` says what the agent changed.
      reset({ name: tag.name, color: tag.color ?? null })
    }
  }, [tag, reset])

  // Read during render so the form subscribes to it.
  const { dirtyFields } = form.formState
  const onSubmit = form.handleSubmit((values) => {
    const payload = buildUpdateTagPayload({ values, dirtyFields, isLocked })
    // Nothing changed: there is nothing to save, so just close.
    if (isEmptyUpdateTagPayload(payload)) {
      onOpenChange(false)
      return
    }
    action.execute(payload)
  })

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={TAG_DIALOG_CONTENT_CLASS}>
        <DialogHeader className={TAG_DIALOG_HEADER_CLASS}>
          <DialogTitle className={TAG_DIALOG_TITLE_CLASS}>
            {t("messages.editFeature", { feature: t("fields.tag.label") })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form className={TAG_DIALOG_FORM_CLASS} onSubmit={onSubmit}>
            <div className={TAG_DIALOG_BODY_CLASS}>
              <LockedDialogFieldset
                bannerKey="tagEditorBanner"
                resourceId={tag?.id}
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className={TAG_DIALOG_FIELD_CLASS}>
                      <FormLabel>{t("fields.name.label")}</FormLabel>
                      <FormControl>
                        <Input
                          className={TAG_DIALOG_INPUT_CLASS}
                          placeholder={t("fields.name.label")}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </LockedDialogFieldset>
              {/* Color stays editable on a View-only copy: the lock policy covers the name only. */}
              <TagColorField key={tag?.id} />
            </div>
            <div className={TAG_DIALOG_FOOTER_CLASS}>
              <Button
                className={TAG_DIALOG_CANCEL_CLASS}
                onClick={() => onOpenChange(false)}
                type="button"
                variant="secondary"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                className={TAG_DIALOG_CONFIRM_CLASS}
                disabled={
                  !(form.formState.isDirty && form.formState.isValid) ||
                  form.formState.isSubmitting
                }
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                {t("actions.confirm")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
