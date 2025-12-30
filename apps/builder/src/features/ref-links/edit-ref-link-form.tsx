"use client"

import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
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
import { updateReflinkAction } from "./actions/update-ref-link-action"
import { createOrUpdateReflinkRequest } from "./schemas/create-or-update-ref-links-schema"
import type { ReflinkResource } from "./schemas/types"

type EditReflinkFormProps = {
  chatbotId: string
  reflink: ReflinkResource
}

export default function EditReflinkForm(props: EditReflinkFormProps) {
  const { chatbotId, reflink } = props
  const t = useTranslations()
  const router = useRouter()

  const flowOptions = useFlowSelectOptions()

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateReflinkAction.bind(null, chatbotId, reflink.id),
    zodResolver(createOrUpdateReflinkRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.reflink.label"),
            }),
          )
          router.back()
          setTimeout(() => router.refresh())
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
      },
      errorMapProps: {},
    },
  )

  useEffect(() => {
    if (reflink) {
      form.reset({
        name: reflink.name,
        flowId: reflink.flowId,
        fieldId: reflink.fieldId,
      })
    }
  }, [reflink, form])

  return (
    <Form {...form}>
      <form className="flex-1 space-y-4" onSubmit={handleSubmitWithAction}>
        <Card className="m-auto max-w-[600px]">
          <CardContent>
            <div className="flex flex-col gap-4">
              <InputField label={t("fields.name.label")} name="name" />
              <ComboboxField
                label={t("fields.flow.label")}
                name="flowId"
                options={flowOptions}
              />
              <CustomFieldSelect
                helpLink=""
                label={t("fields.savePayloadToCustomField.label")}
                name="fieldId"
              />
              <div className="flex justify-end gap-4">
                <Button
                  onClick={() => router.back()}
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
                  {t("actions.save")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  )
}
