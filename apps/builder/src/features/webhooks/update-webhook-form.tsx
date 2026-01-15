"use client"

import type { WebhookModel } from "@aha.chat/database/types"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Form, FormMessage } from "@aha.chat/ui/components/ui/form"
import { Label } from "@aha.chat/ui/components/ui/label"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import { ConditionEditor } from "../conditions/editor"
import { updateWebhookAction } from "./actions/update-webhook-action"
import { AddCondition } from "./add-condition"
import { BaseEditor } from "./base-editor"
import {
  type UpdateWebhookSchema,
  updateWebhookSchema,
} from "./schemas/update-webhook-schema"

type WebhookWithConditions = WebhookModel & {
  conditions?: Array<{
    id: string
    type: number
    sourceId: string | null
    operator: string | null
    value: unknown
  }>
}

type UpdateWebhookFormProps = {
  chatbotId: string
  webhook: WebhookWithConditions
}

export default function UpdateWebhookForm(props: UpdateWebhookFormProps) {
  const { chatbotId, webhook } = props
  const t = useTranslations()
  const router = useRouter()

  const {
    form,
    handleSubmitWithAction,
    form: { control },
  } = useHookFormAction(
    updateWebhookAction.bind(null, chatbotId, webhook.id),
    zodResolver(updateWebhookSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.webhook.label"),
            }),
          )
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
        defaultValues: {
          conditions: (webhook.conditions || []).map((tc) => ({
            id: tc.id,
            type: tc.type,
            sourceId: tc.sourceId || undefined,
            operator: tc.operator || undefined,
            value: tc.value ? tc.value : undefined,
          })) as UpdateWebhookSchema["conditions"],
          url: webhook.url,
        },
      },
      errorMapProps: {},
    },
  )

  const {
    fields: conditions,
    append: appendConditions,
    remove: removeConditions,
  } = useFieldArray({
    control,
    name: "conditions",
  })

  return (
    <Form {...form}>
      <form className="flex-1 space-y-4" onSubmit={handleSubmitWithAction}>
        <div className="flex gap-10">
          {/* condition block */}
          <div className="flex flex-1 flex-col gap-4">
            <Label htmlFor="conditions">{t("trigger.when")}</Label>
            {conditions.map((condition, index) => (
              <BaseEditor
                conditionType={condition.type}
                // biome-ignore lint/suspicious/noArrayIndexKey: wip
                key={index}
                onRemove={() => removeConditions(index)}
              >
                <ConditionEditor
                  parentName={`conditions.${index}`}
                  type={condition.type}
                />
              </BaseEditor>
            ))}
            <FormMessage />
            <AddCondition
              onAdd={(option) => {
                const condition =
                  option.defaultFn() as UpdateWebhookSchema["conditions"][number]
                appendConditions(condition)
              }}
            />
          </div>

          <div className="flex flex-1 flex-col gap-4">
            <Label>URL</Label>
            <TextareaField
              name="url"
              placeholder={t("fields.url.placeholder")}
            />
          </div>
        </div>

        {/* footer */}
        <div className="flex justify-end gap-4">
          <Button onClick={() => router.back()} type="button" variant="ghost">
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
