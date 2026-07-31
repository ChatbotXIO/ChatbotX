"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import z from "zod"
import type {
  CommentAutomationRow,
  CommentAutomationTranslationNamespace,
} from "./types"

const renameSchema = z.object({ name: z.string().trim().min(1).max(255) })
type RenameValues = z.infer<typeof renameSchema>

export function RenameCommentAutomationDialog({
  resource,
  open,
  onOpenChange,
  onSuccess,
  translationNamespace,
  action,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  resource: Pick<CommentAutomationRow, "id" | "workspaceId" | "name"> | null
  translationNamespace: CommentAutomationTranslationNamespace
  // A bound next-safe-action action (`someAction.bind(null, workspaceId, id)`).
  // Called directly rather than through `useAction` — see the sibling delete
  // dialog for why.
  action: (input: {
    name: string
  }) => Promise<{ serverError?: string } | undefined>
  onSuccess?: () => void
}) {
  const t = useTranslations()

  const form = useForm<RenameValues>({
    resolver: zodResolver(renameSchema),
    mode: "onChange",
    defaultValues: { name: resource?.name ?? "" },
  })

  useEffect(() => {
    if (resource) {
      form.setValue("name", resource.name)
    }
  }, [resource, form])

  const handleSubmit = form.handleSubmit(async (data) => {
    const result = await action(data)

    if (result?.serverError) {
      toast.error(result.serverError)
      return
    }

    toast.success(
      t("messages.updatedSuccess", {
        feature: t(`${translationNamespace}.title`),
      }),
    )
    onOpenChange(false)
    onSuccess?.()
  })

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-screen max-w-lg overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>
            {t("messages.editFeature", {
              feature: t(`${translationNamespace}.title`),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form className="flex-1 space-y-4" onSubmit={handleSubmit}>
              <InputField label={t("fields.name.label")} name="name" required />
              <DialogFooter className="justify-end">
                <DialogClose
                  render={
                    <Button size="sm" type="button" variant="ghost">
                      {t("actions.cancel")}
                    </Button>
                  }
                />
                <Button
                  className="ms-auto"
                  disabled={
                    !form.formState.isValid || form.formState.isSubmitting
                  }
                  size="sm"
                  type="submit"
                >
                  {form.formState.isSubmitting && (
                    <Loader2Icon className="animate-spin" />
                  )}
                  {t("actions.confirm")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
