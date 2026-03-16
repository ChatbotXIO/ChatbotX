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
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { toast } from "sonner"
import { CustomFieldSelect } from "../custom-fields/custom-field-select"
import { useFlowSelectOptions } from "../flows/provider/flow-hook"
import { updateReflinkAction } from "./actions/update-reflink.action"
import { updateReflinkRequest } from "./schemas/action"
import type { ReflinkResource } from "./schemas/resource"

type UpdateReflinkFormProps = {
  chatbotId: string
  reflink: ReflinkResource | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UpdateReflinkDialog({
  chatbotId,
  reflink,
  open,
  onOpenChange,
}: UpdateReflinkFormProps) {
  const t = useTranslations()
  const router = useRouter()

  const onCompletedForm = () => {
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("messages.editFeature", { feature: t("fields.reflink.label") })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        {reflink ? (
          <UpdateReflinkForm
            chatbotId={chatbotId}
            onCompletedForm={onCompletedForm}
            reflink={reflink}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export function UpdateReflinkForm(props: {
  reflink: ReflinkResource
  chatbotId: string
  onCompletedForm: () => void
}) {
  const { chatbotId, reflink, onCompletedForm } = props
  const t = useTranslations()

  const flowOptions = useFlowSelectOptions()

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateReflinkAction.bind(null, chatbotId, reflink.id),
    zodResolver(updateReflinkRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.reflink.label"),
            }),
          )
          onCompletedForm()
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

  useEffect(() => {
    if (reflink) {
      form.reset({
        name: reflink.name,
        flowId: reflink.flowId,
        customFieldId: reflink.customFieldId,
      })
    }
  }, [reflink, form])

  return (
    <Form {...form}>
      <form className="flex-1 space-y-4" onSubmit={handleSubmitWithAction}>
        <InputField label={t("fields.name.label")} name="name" required />

        <ComboboxField
          label={t("fields.flow.label")}
          name="flowId"
          options={flowOptions}
          required
        />

        <CustomFieldSelect
          label={t("fields.savePayloadToCustomField.label")}
          name="customFieldId"
        />

        <div className="flex justify-end gap-4">
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
            {t("actions.save")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
