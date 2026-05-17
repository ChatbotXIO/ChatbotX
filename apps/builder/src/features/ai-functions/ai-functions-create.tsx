"use client"

import type { AIFunctionModel } from "@chatbotx.io/database/types"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
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
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, MoveRightIcon, PlusIcon, TrashIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import CustomFieldField from "../custom-fields/components/custom-field-field"
import { useFlowSelectOptions } from "../flows/provider/flow-hook"
import { createAIFunctionAction } from "./actions/create-ai-function.action"
import { updateAIFunctionAction } from "./actions/update-ai-function.action"
import { createAIFunctionRequest } from "./schemas/action"

type AIFunctionsCreateProps = {
  workspaceId: string
  onSuccess?: () => void
  mode?: "create" | "edit" | "duplicate"
  initialData?: AIFunctionModel
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function AIFunctionsCreate({
  workspaceId,
  onSuccess,
  mode = "create",
  initialData,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
}: AIFunctionsCreateProps) {
  const t = useTranslations()

  const [internalOpen, setInternalOpen] = useState(false)
  const isOpen = controlledOpen ?? internalOpen
  const setIsOpen = setControlledOpen ?? setInternalOpen

  const flowOptions = useFlowSelectOptions()

  const action =
    mode === "edit" && initialData
      ? updateAIFunctionAction.bind(null, workspaceId, initialData.id)
      : createAIFunctionAction.bind(null, workspaceId)

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(action, zodResolver(createAIFunctionRequest), {
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
            t(
              `messages.${mode === "edit" ? "updatedSuccess" : "createdSuccess"}`,
              {
                feature: t("fields.aiFunction.label"),
              },
            ),
          )
          resetFormAndAction()
          setIsOpen(false)
          onSuccess?.()
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      errorMapProps: {},
    })

  useEffect(() => {
    if (!isOpen) {
      return
    }

    if (initialData) {
      form.reset({
        name:
          mode === "duplicate"
            ? `${initialData.name} (copy)`
            : initialData.name,
        purpose: initialData.purpose ?? "",
        dataCollect:
          (initialData.dataCollect as { from: string; to: string }[]) ?? [],
        outputMessage: initialData.outputMessage ?? "",
        triggerFlowId: initialData.triggerFlowId,
      })
    } else {
      form.reset({
        name: "",
        purpose: "",
        dataCollect: [],
        outputMessage: "",
        triggerFlowId: null,
      })
    }
  }, [isOpen, initialData, form, mode])

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "dataCollect",
  })

  let titleKey = "messages.createFeature"
  if (mode === "edit") {
    titleKey = "messages.editFeature"
  }
  if (mode === "duplicate") {
    titleKey = "messages.duplicateFeature"
  }

  const title = t(titleKey, { feature: t("fields.aiFunction.label") })

  const trigger = controlledOpen === undefined && (
    <DialogTrigger asChild>
      <Button>
        <PlusIcon className="h-4 w-4" />
        {t("actions.createFeature", {
          feature: t("fields.aiFunction.label"),
        })}
      </Button>
    </DialogTrigger>
  )

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      {trigger}
      <DialogContent className={"max-h-screen overflow-y-scroll lg:max-w-5xl"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription />
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
                  <CustomFieldField name={`dataCollect.${index}.to`} />
                  <Button
                    onClick={() => remove(index)}
                    type="button"
                    variant="outline"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                onClick={() => append({ from: "", to: "" })}
                type="button"
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
            <ComboboxField
              label={t("fields.triggerFlowId.label")}
              name="triggerFlowId"
              options={flowOptions}
              placeholder={t("fields.triggerFlowId.placeholder")}
            />

            <DialogFooter className="gap-2 sm:space-x-0">
              <DialogClose asChild>
                <Button variant="ghost">{t("actions.cancel")}</Button>
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
