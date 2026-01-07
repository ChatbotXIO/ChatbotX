"use client"

import type { TriggerModel } from "@aha.chat/database/types"
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
import { updateTriggerAction } from "./actions/update-trigger-action"
import { AddAction } from "./add-action"
import { AddCondition } from "./add-condition"
import { BaseEditor } from "./base-editor"
import { ActionEditor } from "./components/actions/editor"
import { ConditionEditor } from "./components/conditions/editor"
import {
  type UpdateTriggerSchema,
  updateTriggerSchema,
} from "./schemas/update-trigger-schema"

type TriggerWithConditions = TriggerModel & {
  triggerConditions?: Array<{
    id: string
    type: number
    sourceId: string | null
    operator: string | null
    value: unknown
  }>
}

type UpdateTriggerFormProps = {
  chatbotId: string
  trigger: TriggerWithConditions
}

export default function UpdateTriggerForm(props: UpdateTriggerFormProps) {
  const { chatbotId, trigger } = props
  const t = useTranslations()
  const router = useRouter()

  const {
    form,
    handleSubmitWithAction,
    form: { control },
  } = useHookFormAction(
    updateTriggerAction.bind(null, chatbotId, trigger.id),
    zodResolver(updateTriggerSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.trigger.label"),
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
          conditions: (trigger.triggerConditions || []).map((tc) => ({
            id: tc.id,
            type: tc.type,
            sourceId: tc.sourceId || undefined,
            operator: tc.operator || undefined,
            value: tc.value ? tc.value : undefined,
          })) as UpdateTriggerSchema["conditions"],
          actions: trigger.actions as UpdateTriggerSchema["actions"],
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

  const {
    fields: actions,
    append: appendActions,
    remove: removeActions,
  } = useFieldArray({
    control,
    name: "actions",
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
                  option.defaultFn() as UpdateTriggerSchema["conditions"][number]
                appendConditions(condition)
              }}
            />
          </div>

          {/* actions block */}
          <div className="flex flex-1 flex-col gap-4">
            <Label htmlFor="actions">{t("fields.actions.label")}</Label>
            {actions.map((action, index) => (
              <BaseEditor
                actionType={action.type}
                // biome-ignore lint/suspicious/noArrayIndexKey: wip
                key={index}
                onRemove={() => removeActions(index)}
              >
                <ActionEditor
                  parentName={`actions.${index}`}
                  type={action.type}
                />
              </BaseEditor>
            ))}
            <FormMessage />
            <AddAction
              onAdd={(option) => {
                const action =
                  option.defaultFn() as UpdateTriggerSchema["actions"][number]
                appendActions(action)
              }}
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
