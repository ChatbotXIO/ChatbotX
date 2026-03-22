"use client"

import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { CustomFieldSelect } from "../custom-fields/custom-field-select"
import { useFlowSelectOptions } from "../flows/provider/flow-hook"
import { createReflinkAction } from "./actions/create-reflink.action"
import { createReflinkRequest } from "./schemas/action"

export function CreateReflinkDialog({ chatbotId }: { chatbotId: string }) {
  const t = useTranslations()
  const router = useRouter()

  const [open, setOpen] = useState(false)

  const onCompletedForm = () => {
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          {t("actions.createFeature", { feature: t("fields.reflink.label") })}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("messages.createFeature", {
              feature: t("fields.reflink.label"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <CreateReflinkForm
          chatbotId={chatbotId}
          onCompletedForm={onCompletedForm}
        />
      </DialogContent>
    </Dialog>
  )
}

export function CreateReflinkForm({
  chatbotId,
  onCompletedForm,
}: {
  chatbotId: string
  onCompletedForm?: () => void
}) {
  const t = useTranslations()

  const flowOptions = useFlowSelectOptions()

  const { form, handleSubmitWithAction } = useHookFormAction(
    createReflinkAction.bind(null, chatbotId),
    zodResolver(createReflinkRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.createdSuccess", {
              feature: t("fields.reflink.label"),
            }),
          )
          onCompletedForm?.()
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
          flowId: "",
          customFieldId: "",
        },
      },
    },
  )

  return (
    <Form {...form}>
      <form className="flex-1 space-y-6" onSubmit={handleSubmitWithAction}>
        <InputField
          label={t("fields.name.label")}
          name="name"
          pattern="^[a-zA-Z0-9]*$"
          required
        />

        <ComboboxField
          label={t("fields.botResponse.label")}
          name="flowId"
          options={flowOptions}
          required
        />

        <CustomFieldSelect
          label={t("fields.customField.savePayloadTo")}
          name="customFieldId"
        />

        <div className="flex justify-end gap-2">
          <Button onClick={onCompletedForm} type="button" variant="ghost">
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={!form.formState.isValid || form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting && (
              <Loader2Icon className="animate-spin" />
            )}
            {t("actions.create")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
