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
import { createQuestionnaireAction } from "../actions/create-questionnaire.action"
import { createQuestionnaireRequest } from "../schemas/action"

export function CreateQuestionnaireDialog({
  workspaceId,
}: {
  workspaceId: string
}) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { form, handleSubmitWithAction } = useHookFormAction(
    createQuestionnaireAction.bind(null, workspaceId),
    zodResolver(createQuestionnaireRequest),
    {
      actionProps: {
        onSuccess: ({ data }) => {
          toast.success(
            t("messages.createdSuccess", {
              feature: t("questionnaires.singular"),
            }),
          )
          setOpen(false)
          form.reset()
          if (data?.id) {
            router.push(`/space/${workspaceId}/questionnaires/${data.id}/edit`)
          } else {
            router.push(`/space/${workspaceId}/questionnaires`)
          }
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: { name: "" },
      },
    },
  )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button size="sm">
            <PlusIcon className="size-4" />
            {t("actions.add")}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("questionnaires.addNew")}</DialogTitle>
          <DialogDescription>
            {t("questionnaires.dialogDescriptions.create")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={handleSubmitWithAction}>
            <InputField label={t("fields.name.label")} name="name" required />
            <DialogFooter>
              <Button
                onClick={() => setOpen(false)}
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
                {t("actions.continue")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
