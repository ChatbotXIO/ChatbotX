"use client"

import { FormInput } from "@/components/form-input"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Form, FormLabel } from "@/components/ui/form"
import { CustomFieldSelect } from "@/features/fields/custom-field-select"
import { FlowSelect } from "@/features/flows/flow-select"
import { createAITriggerAction } from "@/features/integrations/ai-triggers/actions/create.action"
import { createAITriggerRequest } from "@/features/integrations/ai-triggers/schemas/create.schema"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { T, useTranslate } from "@tolgee/react"
import { ArrowRightIcon, Loader2Icon, PlusIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"

type CreateAITriggerDialogProps = {
  chatbotId: string
}

export function CreateAITriggerDialog({
  chatbotId,
}: CreateAITriggerDialogProps) {
  const { t } = useTranslate()
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const {
    form,
    handleSubmitWithAction,
    resetFormAndAction,
    form: { control },
  } = useHookFormAction(
    createAITriggerAction.bind(null, chatbotId),
    zodResolver(createAITriggerRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success("AI Trigger created successfully")

          setOpen(false)
          resetFormAndAction()
          router.refresh()
        },
        onError: ({ error }) => {
          error.serverError && toast.error(error.serverError)
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          name: "",
          description: "",
          finalMessage: "",
          flowId: null,
        },
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          <T keyName="aiTriggers.addBtn" />
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("aiTriggers.create.title")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              onSubmit={handleSubmitWithAction}
              className="flex-1 space-y-4"
            >
              <FormInput name="name" label={t("aiTriggers.name")} />

              <FormInput
                name="description"
                label={t("aiTriggers.description")}
                inputType="textarea"
                isRequired={false}
              />

              <div className="flex flex-col space-y-2">
                <FormLabel>{t("aiTriggers.dataCollect")}</FormLabel>
                {fields.map((field, i) => (
                  <div className="flex items-top" key={field.id}>
                    <div className="basis-5/12">
                      <FormInput name={`questions.${i}.name`} label="" />
                    </div>
                    <div className="basis-1/12 flex justify-center">
                      <ArrowRightIcon className="mt-2" />
                    </div>

                    <div className="basis-5/12">
                      <CustomFieldSelect
                        name={`questions.${i}.fieldId`}
                        label=""
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

              <FlowSelect
                name="flowId"
                label={t("aiTriggers.flowId")}
                isRequired={false}
              />

              <FormInput
                name="finalMessage"
                label={t("aiTriggers.finalMessage")}
                inputType="textarea"
                isRequired={false}
              />

              <DialogFooter className="justify-end">
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    Close
                  </Button>
                </DialogClose>
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
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
