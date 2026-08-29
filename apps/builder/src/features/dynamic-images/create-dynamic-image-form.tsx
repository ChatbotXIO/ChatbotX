"use client"

import type { DynamicImageDocument } from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { useCustomFieldSelectOptions } from "@/features/custom-fields/provider/custom-field-hook"
import { createDynamicImageAction } from "./actions/create-dynamic-image.action"
import { DynamicImageEditor } from "./components/dynamic-image-editor"
import { DynamicImageTemplatePicker } from "./components/template-picker"
import { DEFAULT_DYNAMIC_IMAGE_DOCUMENT } from "./constants"
import { createDynamicImageRequest } from "./schemas/action"

export function CreateDynamicImageForm({
  workspaceId,
}: {
  workspaceId: string
}) {
  const t = useTranslations()
  const router = useRouter()
  const customFieldOptions = useCustomFieldSelectOptions()

  const [data, setData] = useState<DynamicImageDocument>(
    DEFAULT_DYNAMIC_IMAGE_DOCUMENT,
  )

  const { form, action } = useHookFormAction(
    createDynamicImageAction.bind(null, workspaceId),
    zodResolver(createDynamicImageRequest),
    {
      actionProps: {
        onSuccess: ({ data: result }) => {
          toast.success(
            t("messages.createdSuccess", {
              feature: t("fields.dynamicImage.label"),
            }),
          )
          if (result?.id) {
            router.push(
              `/space/${workspaceId}/dynamic-images/${result.id}/edit`,
            )
          } else {
            router.push(`/space/${workspaceId}/dynamic-images`)
          }
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
          customFieldId: null,
          data: DEFAULT_DYNAMIC_IMAGE_DOCUMENT,
        },
      },
    },
  )

  // `data` is plain React state managed by the canvas editor, not a
  // react-hook-form field — merge it into the payload only on submit.
  const onSubmit = form.handleSubmit((values) =>
    action.execute({ ...values, data }),
  )

  return (
    <Form {...form}>
      <form className="flex-1 space-y-6" onSubmit={onSubmit}>
        <InputField label={t("fields.name.label")} name="name" required />

        <DynamicImageTemplatePicker onSelect={setData} />

        <ComboboxField
          allowClear
          emptyText={t("actions.noRecordFound")}
          emptyValue={null}
          label={t("fields.customField.label")}
          name="customFieldId"
          options={customFieldOptions}
          placeholder={t("actions.pleaseSelect")}
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dynamic-image-width">
              {t("dynamicImages.editor.width")}
            </Label>
            <Input
              id="dynamic-image-width"
              min={1}
              onChange={(event) =>
                setData({
                  ...data,
                  width: Number(event.target.value) || data.width,
                })
              }
              type="number"
              value={data.width}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dynamic-image-height">
              {t("dynamicImages.editor.height")}
            </Label>
            <Input
              id="dynamic-image-height"
              min={1}
              onChange={(event) =>
                setData({
                  ...data,
                  height: Number(event.target.value) || data.height,
                })
              }
              type="number"
              value={data.height}
            />
          </div>
        </div>

        <DynamicImageEditor
          onChange={setData}
          value={data}
          workspaceId={workspaceId}
        />

        <div className="flex justify-end gap-2">
          <Button
            onClick={() => router.push(`/space/${workspaceId}/dynamic-images`)}
            type="button"
            variant="ghost"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={!form.formState.isValid || action.isPending}
            type="submit"
          >
            {action.isPending && <Loader2Icon className="animate-spin" />}
            {t("actions.create")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
