"use client"

import { InputField } from "@/components/form/input-field"
import { TextareaField } from "@/components/form/textarea-field"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Form, FormLabel } from "@/components/ui/form"
import { CustomFieldSelect } from "@/features/fields/custom-field-select"
import { FlowSelect } from "@/features/flows/flow-select"
import { updateAITriggerAction } from "@/features/integrations/ai-triggers/actions/update.action"
import { updateAITriggerRequest } from "@/features/integrations/ai-triggers/schemas/update.schema"
import type { AITrigger } from "@ahachat.ai/database/types"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslate } from "@tolgee/react"
import { ArrowRightIcon, Loader2Icon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import type { CreateAITriggerRequest } from "./schemas/create.schema"

type UpdateAITriggerDialogProps = {
  open: boolean
  onOpenChange: (val: boolean) => void
  chatbotId: string
  trigger: AITrigger | null
}

export function UpdateAITriggerDialog({
  trigger,
  open,
  onOpenChange,
}: UpdateAITriggerDialogProps) {
  const { t } = useTranslate()
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
          toast.success("AI Trigger update successfully")

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("aiTriggers.update.title")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              onSubmit={handleSubmitWithAction}
              className="flex-1 space-y-4"
            >
              <InputField name="name" label={t("aiTriggers.name")} />

              <TextareaField
                name="description"
                label={t("aiTriggers.description")}
              />

              <div className="flex flex-col space-y-2">
                <FormLabel>{t("aiTriggers.dataCollect")}</FormLabel>
                {fields.map((field, i) => (
                  <div className="flex items-center space-x-2" key={field.id}>
                    <div className="basis-5/12">
                      <InputField name={`questions.${i}.name`} />
                    </div>

                    <div className="basis-1/12 flex justify-center">
                      <ArrowRightIcon className="mt-2" />
                    </div>

                    <div className="basis-5/12">
                      <CustomFieldSelect
                        label=""
                        name={`questions.${i}.fieldId`}
                        isRequired={false}
                      />
                    </div>

                    <div className="basis-1/12">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => remove(i)}
                      >
                        <XIcon />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onAddDataCollection}
                >
                  {t("aiTriggers.dataCollect.addBtn")}
                </Button>
              </div>

              <FlowSelect name="flowId" label={t("aiTriggers.flowId")} />

              <TextareaField
                name="finalMessage"
                label={t("aiTriggers.finalMessage")}
              />

              <div className="flex justify-end gap-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                >
                  {t("common.cancel-btn")}
                </Button>
                <Button
                  type="submit"
                  disabled={
                    !form.formState.isValid || form.formState.isSubmitting
                  }
                >
                  {form.formState.isSubmitting && (
                    <Loader2Icon className="animate-spin" />
                  )}
                  {t("common.confirm-btn")}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
