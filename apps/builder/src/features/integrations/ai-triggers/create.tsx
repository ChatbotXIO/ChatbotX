"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form, FormLabel } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { T, useTranslate } from "@tolgee/react"
import { ArrowRightIcon, Loader2Icon, PlusIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { FlowSelect } from "@/features/flows/flow-select"
import { createAITriggerAction } from "@/features/integrations/ai-triggers/actions/create.action"
import { createAITriggerRequest } from "@/features/integrations/ai-triggers/schemas/create.schema"

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
    <Dialog onOpenChange={setOpen} open={open}>
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
              className="flex-1 space-y-4"
              onSubmit={handleSubmitWithAction}
            >
              <InputField label={t("aiTriggers.name")} name="name" />

              <TextareaField
                isRequired={false}
                label={t("aiTriggers.description")}
                name="description"
              />

              <div className="flex flex-col space-y-2">
                <FormLabel>{t("aiTriggers.dataCollect")}</FormLabel>
                {fields.map((field, i) => (
                  <div className="items-top flex" key={field.id}>
                    <div className="basis-5/12">
                      <InputField name={`questions.${i}.name`} />
                    </div>
                    <div className="flex basis-1/12 justify-center">
                      <ArrowRightIcon className="mt-2" />
                    </div>

                    <div className="basis-5/12">
                      <CustomFieldSelect
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
                  {t("aiTriggers.dataCollect.addBtn")}
                </Button>
              </div>

              <FlowSelect
                isRequired={false}
                label={t("aiTriggers.flowId")}
                name="flowId"
              />

              <TextareaField
                isRequired={false}
                label={t("aiTriggers.finalMessage")}
                name="finalMessage"
              />

              <DialogFooter className="justify-end">
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    Close
                  </Button>
                </DialogClose>
                <Button
                  disabled={
                    !form.formState.isValid || form.formState.isSubmitting
                  }
                  type="submit"
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
