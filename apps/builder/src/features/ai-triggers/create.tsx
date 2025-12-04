"use client"

import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
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
import { ArrowRightIcon, Loader2Icon, PlusIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import { createAITriggerAction } from "@/features/ai-triggers/actions/create.action"
import { createAITriggerRequest } from "@/features/ai-triggers/schemas/create.schema"
import { FlowSelect } from "@/features/flows/flow-select"
import { useCustomFieldSelectOptions } from "../custom-fields/provider/custom-field-hook"

type CreateAITriggerDialogProps = {
  chatbotId: string
}

export function CreateAITriggerDialog({
  chatbotId,
}: CreateAITriggerDialogProps) {
  const t = useTranslations()
  const router = useRouter()

  const customFieldSelectOptions = useCustomFieldSelectOptions({})

  const [open, setOpen] = useState(false)

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
          toast.success(
            t("messages.createdSuccess", {
              feature: t("fields.aiTrigger.label"),
            }),
          )

          setOpen(false)
          resetFormAndAction()
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
          {t("actions.createFeature", { feature: t("fields.aiTrigger.label") })}
        </Button>
      </DialogTrigger>
      <DialogContent className={"max-h-screen overflow-y-scroll lg:max-w-5xl"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.createFeature", {
              feature: t("fields.aiTrigger.label"),
            })}
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
                  <div className="items-top flex" key={field.id}>
                    <div className="basis-5/12">
                      <InputField name={`questions.${i}.name`} />
                    </div>
                    <div className="flex basis-1/12 justify-center">
                      <ArrowRightIcon className="mt-2" />
                    </div>

                    <div className="basis-5/12">
                      <ComboboxField
                        name={`questions.${i}.fieldId`}
                        options={customFieldSelectOptions}
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

              <DialogFooter className="justify-end">
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    {t("actions.cancel")}
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
