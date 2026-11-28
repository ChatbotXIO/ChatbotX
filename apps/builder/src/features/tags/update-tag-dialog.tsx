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
import { buildUpdateTagPayload } from "./lib/update-tag-payload"
import { updateTagSchema } from "./schema/action"
import { TagColorField } from "./tag-color-field"

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
  const onSubmit = form.handleSubmit((values) =>
    action.execute(
      buildUpdateTagPayload({
        values,
        dirtyFields,
        isLocked,
      }),
    ),
  )

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.editFeature", { feature: t("fields.tag.label") })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form className="flex-1 space-y-4" onSubmit={onSubmit}>
              <LockedDialogFieldset
                bannerKey="tagEditorBanner"
                resourceId={tag?.id}
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("fields.name.label")}</FormLabel>
                      <FormControl>
                        <Input
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
              <div className="flex justify-end gap-4">
                <Button
                  onClick={() => onOpenChange(false)}
                  type="button"
                  variant="ghost"
                >
                  {t("actions.cancel")}
                </Button>
                <Button
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
