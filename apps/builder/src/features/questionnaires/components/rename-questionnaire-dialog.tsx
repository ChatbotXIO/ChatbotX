"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
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
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { toast } from "sonner"
import { renameQuestionnaireAction } from "../actions/rename-questionnaire.action"
import { renameQuestionnaireRequest } from "../schemas/action"
import type { QuestionnaireListItem } from "../schemas/resource"

type Props = {
  workspaceId: string
  questionnaire: QuestionnaireListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RenameQuestionnaireDialog({
  workspaceId,
  questionnaire,
  open,
  onOpenChange,
}: Props) {
  const t = useTranslations()
  const router = useRouter()
  const { form, handleSubmitWithAction } = useHookFormAction(
    renameQuestionnaireAction.bind(null, workspaceId, questionnaire?.id ?? ""),
    zodResolver(renameQuestionnaireRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("questionnaires.singular"),
            }),
          )
          onOpenChange(false)
          router.refresh()
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: { name: questionnaire?.name ?? "" },
      },
    },
  )

  useEffect(() => {
    form.reset({ name: questionnaire?.name ?? "" })
  }, [form, questionnaire])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("actions.rename")}</DialogTitle>
          <DialogDescription>
            {t("questionnaires.dialogDescriptions.rename")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={handleSubmitWithAction}>
            <InputField label={t("fields.name.label")} name="name" required />
            <DialogFooter>
              <Button
                onClick={() => onOpenChange(false)}
                type="button"
                variant="ghost"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="size-4 animate-spin" />
                )}
                {t("actions.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
