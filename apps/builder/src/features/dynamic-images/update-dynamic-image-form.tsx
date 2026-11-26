"use client"

import type { DynamicImageDocument } from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { CopyIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { useCustomFieldSelectOptions } from "@/features/custom-fields/provider/custom-field-hook"
import {
  LockedContent,
  useIsEditorLocked,
} from "@/features/templates/components/locked-editor"
import { updateDynamicImageAction } from "./actions/update-dynamic-image.action"
import { DynamicImageEditor } from "./components/dynamic-image-editor"
import { DynamicImageTemplatePicker } from "./components/template-picker"
import { updateDynamicImageRequest } from "./schema/action"
import type { DynamicImageResource } from "./schema/resource"

function PublicUrlSection({ publicUrl }: { publicUrl: string }) {
  const t = useTranslations()
  const [, copy] = useCopyToClipboard()

  const handleCopy = () => {
    copy(publicUrl)
      .then(() => {
        toast.success(t("messages.copiedToClipboard"))
      })
      .catch(() => {
        toast.error(t("messages.copyFailed"))
      })
  }

  return (
    <div className="space-y-2 rounded-md border p-4">
      <p className="font-medium text-sm">
        {t("dynamicImages.publicUrl.label")}
      </p>
      <div className="flex items-center gap-2">
        <Input readOnly value={publicUrl} />
        <Button
          aria-label={t("actions.copyUrl")}
          onClick={handleCopy}
          size="icon"
          type="button"
          variant="secondary"
        >
          <CopyIcon className="size-4" />
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {t("dynamicImages.publicUrl.hint")}
      </p>
    </div>
  )
}

export function UpdateDynamicImageForm({
  workspaceId,
  dynamicImage,
  publicUrl,
}: {
  workspaceId: string
  dynamicImage: DynamicImageResource
  publicUrl: string
}) {
  const isLocked = useIsEditorLocked()
  const t = useTranslations()
  const router = useRouter()
  const customFieldOptions = useCustomFieldSelectOptions()

  const [data, setData] = useState<DynamicImageDocument>(dynamicImage.data)

  const { form, action } = useHookFormAction(
    updateDynamicImageAction.bind(null, workspaceId, dynamicImage.id),
    zodResolver(updateDynamicImageRequest),
    {
      actionProps: {
        onSuccess: ({ input }) => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.dynamicImage.label"),
            }),
          )
          // What the server saved is the new baseline; an edit made while the
          // request was in flight keeps its value and stays dirty.
          const current = form.getValues()
          form.reset({
            name: input.name,
            customFieldId: input.customFieldId,
            data: input.data,
          })
          if (current.name !== input.name) {
            form.setValue("name", current.name, { shouldDirty: true })
          }
          if (current.customFieldId !== input.customFieldId) {
            form.setValue("customFieldId", current.customFieldId, {
              shouldDirty: true,
            })
          }
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
          name: dynamicImage.name,
          customFieldId: dynamicImage.customFieldId,
          data: dynamicImage.data,
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
    <Card>
      <CardHeader>
        <CardTitle>
          {t("messages.editFeature", {
            feature: t("fields.dynamicImage.label"),
          })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="space-y-6" onSubmit={onSubmit}>
            <LockedContent className="space-y-6">
              <InputField label={t("fields.name.label")} name="name" required />

              <DynamicImageTemplatePicker onSelect={setData} />

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
            </LockedContent>

            <ComboboxField
              allowClear
              emptyText={t("actions.noRecordFound")}
              emptyValue={null}
              label={t("fields.customField.label")}
              name="customFieldId"
              options={customFieldOptions}
              placeholder={t("actions.pleaseSelect")}
            />

            <PublicUrlSection publicUrl={publicUrl} />

            <div className="flex justify-end gap-2">
              <Button
                onClick={() =>
                  router.push(`/space/${workspaceId}/dynamic-images`)
                }
                type="button"
                variant="ghost"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                disabled={
                  !form.formState.isValid ||
                  action.isPending ||
                  // On a View-only copy only the cache field is the installer's.
                  (isLocked && !form.formState.dirtyFields.customFieldId)
                }
                type="submit"
              >
                {action.isPending && <Loader2Icon className="animate-spin" />}
                {t("actions.save")}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
