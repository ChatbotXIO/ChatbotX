"use client"

import type { AITriggerModel } from "@aha.chat/database/types"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@aha.chat/ui/components/ui/dialog"
import { Form, FormLabel } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { ArrowRightIcon, Loader2Icon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { FlowSelect } from "@/features/flows/flow-select"
import { updateAITriggerAction } from "@/features/integrations/ai-triggers/actions/update.action"
import { updateAITriggerRequest } from "@/features/integrations/ai-triggers/schemas/update.schema"
import type { CreateAITriggerRequest } from "./schemas/create.schema"

type UpdateAITriggerDialogProps = {
  open: boolean
  onOpenChange: (val: boolean) => void
  chatbotId: string
  trigger: AITriggerModel | null
}

export function UpdateAITriggerDialog({
  trigger,
  open,
  onOpenChange,
}: UpdateAITriggerDialogProps) {
  const t = useTranslations()
  const router = useRouter()

  const {
    form,
    handleSubmitWithAction,
    form: { control, reset },
    resetFormAndAction,
  } = useHookFormAction(
    updateAITriggerAction.bind(
      null,
      trigger?.chatbotId ?? "",
      trigger?.id ?? "",
    ),
    zodResolver(updateAITriggerRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccessfully", {
              feature: t("fields.aiTrigger.label"),
            }),
          )

          resetFormAndAction()
          onOpenChange(false)
          router.refresh()
        },
        onError: ({ error }) => {
          error.serverError && toast.error(error.serverError)
        },
      },
      formProps: {
        mode: "onChange",
      },
      errorMapProps: {},
    },
  )

  const { fields, append, remove } = useFieldArray({
    control,
    name: "questions",
  })

  const onAddDataCollection = () => {
    append({
      name: "",
      fieldId: "",
    })
  }

  useEffect(() => {
    if (trigger) {
      const { questions, ...rest } = trigger
      reset({
        ...rest,
        questions: questions as CreateAITriggerRequest["questions"],
      })
    }
  }, [trigger, reset])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("dialog.updateTitle", { feature: t("fields.aiTrigger.label") })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              className="flex-1 space-y-4"
              onSubmit={handleSubmitWithAction}
            >
              <InputField label={t("fields.name.label")} name="name" />

              <TextareaField
                label={t("fields.description.label")}
                name="description"
              />

              <div className="flex flex-col space-y-2">
                <FormLabel>{t("fields.dataCollect.label")}</FormLabel>
                {fields.map((field, i) => (
                  <div className="flex items-center space-x-2" key={field.id}>
                    <div className="basis-5/12">
                      <InputField name={`questions.${i}.name`} />
                    </div>

                    <div className="flex basis-1/12 justify-center">
                      <ArrowRightIcon className="mt-2" />
                    </div>

                    <div className="basis-5/12">
                      <CustomFieldSelect
                        isRequired={false}
                        label=""
                        name={`questions.${i}.fieldId`}
                      />
                    </div>

                    <div className="basis-1/12">
                      <Button
                        onClick={() => remove(i)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <XIcon />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  onClick={onAddDataCollection}
                  type="button"
                  variant="secondary"
                >
                  {t("actions.add")}
                </Button>
              </div>

              <FlowSelect label={t("fields.flowId.label")} name="flowId" />

              <TextareaField
                label={t("fields.finalMessage.label")}
                name="finalMessage"
              />

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
                    !form.formState.isValid || form.formState.isSubmitting
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
