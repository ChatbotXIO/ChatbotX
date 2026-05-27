"use client"

import type { ClosingNotesMode } from "@chatbotx.io/database/partials"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
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
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo } from "react"
import { toast } from "sonner"
import type { ClosingNoteCategoryOption } from "@/features/closing-notes/queries/get-config"
import { closeConversationWithNoteAction } from "../actions/close-conversation-with-note.action"
import { closeConversationWithNoteFormSchema } from "../schema/close-with-note"

type CloseConversationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  conversationId: string
  mode: Exclude<ClosingNotesMode, "disabled">
  categories: ClosingNoteCategoryOption[]
  onSuccess?: () => void
}

// Modal de fechamento que aparece quando closingNotesMode != "disabled"
// (mode "disabled" continua fechando direto via archiveConversationAction).
//
// Regras por modo:
//   optional        → categoria + summary opcionais; mostra botão "Pular".
//   mandatoryDialog → categoria obrigatória; summary opcional; sem "Pular".
//   mandatoryBoth   → categoria + summary obrigatórios; sem "Pular".
export function CloseConversationDialog({
  open,
  onOpenChange,
  workspaceId,
  conversationId,
  mode,
  categories,
  onSuccess,
}: CloseConversationDialogProps) {
  const t = useTranslations()

  const categoryOptions = useMemo(
    () =>
      categories.map((c) => ({
        value: c.id,
        label: c.name,
      })),
    [categories],
  )

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      closeConversationWithNoteAction.bind(null, workspaceId),
      zodResolver(closeConversationWithNoteFormSchema),
      {
        actionProps: {
          onSuccess: () => {
            toast.success(t("closingNotes.dialog.successToast"))
            resetFormAndAction()
            onOpenChange(false)
            onSuccess?.()
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
            conversationId,
            categoryId: undefined,
            summary: "",
          },
        },
        errorMapProps: {},
      },
    )

  const { isSubmitting } = form.formState
  // Validação contextual por modo (server tem espelhamento — UI só facilita).
  const watchedCategoryId = form.watch("categoryId")
  const watchedSummary = form.watch("summary")
  const requiresCategory =
    mode === "mandatoryDialog" || mode === "mandatoryBoth"
  const requiresSummary = mode === "mandatoryBoth"
  const meetsRequirements =
    (!requiresCategory || Boolean(watchedCategoryId)) &&
    (!requiresSummary || Boolean(watchedSummary?.trim()))

  // Reset quando reabrir com conversationId diferente.
  useEffect(() => {
    if (open) {
      form.reset({
        conversationId,
        categoryId: undefined,
        summary: "",
      })
    }
  }, [open, conversationId, form])

  const handleSkipAndClose = () => {
    form.setValue("categoryId", undefined)
    form.setValue("summary", "")
    handleSubmitWithAction()
  }

  const hasCategories = categoryOptions.length > 0
  const showSkip = mode === "optional"

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("closingNotes.dialog.title")}</DialogTitle>
          <DialogDescription>
            {t(`closingNotes.dialog.description.${mode}`)}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={handleSubmitWithAction}
          >
            {hasCategories ? (
              <SelectField
                label={t("closingNotes.dialog.categoryLabel")}
                name="categoryId"
                options={categoryOptions}
                placeholder={t("closingNotes.dialog.categoryPlaceholder")}
                required={mode !== "optional"}
              />
            ) : (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200 text-xs">
                {t("closingNotes.dialog.noCategories")}
              </p>
            )}

            <TextareaField
              label={t("closingNotes.dialog.summaryLabel")}
              name="summary"
              placeholder={t("closingNotes.dialog.summaryPlaceholder")}
              required={mode === "mandatoryBoth"}
              rows={4}
            />

            <DialogFooter className="gap-2 sm:gap-2">
              <DialogClose asChild>
                <Button size="sm" type="button" variant="ghost">
                  {t("actions.cancel")}
                </Button>
              </DialogClose>

              {showSkip && (
                <Button
                  disabled={isSubmitting}
                  onClick={handleSkipAndClose}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {isSubmitting && (
                    <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t("closingNotes.dialog.skip")}
                </Button>
              )}

              <Button
                disabled={
                  isSubmitting ||
                  !meetsRequirements ||
                  (requiresCategory && !hasCategories)
                }
                size="sm"
                type="submit"
              >
                {isSubmitting && (
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t("closingNotes.dialog.confirm")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
