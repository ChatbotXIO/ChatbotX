"use client"

import type { FieldModel, FlowModel } from "@aha.chat/database/types"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, MoveRightIcon, PlusIcon, TrashIcon } from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import { createAIFunctionAction } from "./actions/create-ai-function.action"
import { createAIFunctionRequest } from "./schemas"

type AIFunctionsCreateProps = {
  flows: FlowModel[]
  customFields: FieldModel[]
}

export function AIFunctionsCreate({
  flows,
  customFields,
}: AIFunctionsCreateProps) {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const t = useTranslations()

  const [isOpen, setIsOpen] = useState(false)

  const flowOptions = useMemo(() => {
    const options = flows.map((flow) => ({
      label: flow.name,
      value: flow.id,
    }))
    return options
  }, [flows])

  const customFieldOptions = useMemo(() => {
    const options = customFields.map((field) => ({
      label: field.name,
      value: field.id,
    }))
    return options
  }, [customFields])

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createAIFunctionAction.bind(null, chatbotId),
      zodResolver(createAIFunctionRequest),
      {
        formProps: {
          mode: "onChange",
          defaultValues: {
            name: "",
            purpose: "",
            dataCollect: [],
            outputMessage: "",
            triggerFlowId: null,
          },
        },
        actionProps: {
          onSuccess: () => {
            toast.success(
              t("messages.createSuccess", {
                feature: t("fields.aiFunction.label"),
              }),
            )
            resetFormAndAction()
            setIsOpen(false)
          },
          onError: ({ error }) => {
            if (error.serverError) {
              toast.error(error.serverError)
            }
          },
        },
        errorMapProps: {},
      },
    )

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "dataCollect",
  })

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className="h-4 w-4" />
          {t("actions.createFeature", {
            feature: t("fields.aiFunction.label"),
          })}
        </Button>
      </DialogTrigger>
      <DialogContent className={"max-h-screen overflow-y-scroll lg:max-w-5xl"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.createTitle", {
              feature: t("fields.aiFunction.label"),
            })}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col space-y-6 py-4"
            onSubmit={handleSubmitWithAction}
          >
            <InputField
              label={t("fields.name.label")}
              name="name"
              placeholder={t("fields.name.placeholder")}
              required
            />
            <TextareaField
              label={t("fields.purpose.label")}
              name="purpose"
              placeholder={t("fields.purpose.placeholder")}
            />
            <div className="space-y-2">
              <div className="font-medium text-sm">
                {t("fields.dataCollect.label")}
              </div>
              {fields.map((field, index) => (
                <div className="mt-2 flex items-start gap-2" key={field.id}>
                  <InputField
                    name={`dataCollect.${index}.from`}
                    placeholder="Attribute"
                  />
                  <MoveRightIcon className="size-10" />
                  <SelectField
                    name={`dataCollect.${index}.to`}
                    options={customFieldOptions}
                  />
                  <Button onClick={() => remove(index)} variant="outline">
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                onClick={() => append({ from: "", to: "" })}
                variant="outline"
              >
                <PlusIcon className="h-4 w-4" />
                {t("actions.addMore")}
              </Button>
            </div>
            <TextareaField
              label={t("fields.outputMessage.label")}
              name="outputMessage"
              placeholder={t("fields.outputMessage.placeholder")}
            />
            <SelectField
              label={t("fields.triggerFlowId.label")}
              name="triggerFlowId"
              options={flowOptions}
              placeholder={t("fields.triggerFlowId.placeholder")}
            />

            <DialogFooter className="gap-2 sm:space-x-0">
              <DialogClose asChild>
                <Button variant="outline">{t("actions.cancel")}</Button>
              </DialogClose>

              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                {t("actions.confirm")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
