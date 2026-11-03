"use client"

import {
  type CommentModerationCategory,
  commentModerationCategories,
} from "@chatbotx.io/database/partials"
import { CheckboxGroupField } from "@chatbotx.io/ui/components/form/checkbox-group-field"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { RadioGroupField } from "@chatbotx.io/ui/components/form/radio-group-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { useTranslations } from "next-intl"
import { useFormContext, useWatch } from "react-hook-form"
import { useAIAgentSelectOptions } from "@/features/ai-agents/hooks/use-ai-agents"
import { useWorkspaceId } from "@/hooks/routing"

const categoryLabelKeys = {
  hate: "commentAutomation.aiModeration.categories.hate",
  offensive: "commentAutomation.aiModeration.categories.offensive",
  harassment: "commentAutomation.aiModeration.categories.harassment",
  negative: "commentAutomation.aiModeration.categories.negative",
  spam: "commentAutomation.aiModeration.categories.spam",
} as const satisfies Record<CommentModerationCategory, string>

const categoryDescriptionKeys = {
  hate: "commentAutomation.aiModeration.categoryDescriptions.hate",
  offensive: "commentAutomation.aiModeration.categoryDescriptions.offensive",
  harassment: "commentAutomation.aiModeration.categoryDescriptions.harassment",
  negative: "commentAutomation.aiModeration.categoryDescriptions.negative",
  spam: "commentAutomation.aiModeration.categoryDescriptions.spam",
} as const satisfies Record<CommentModerationCategory, string>

type Props = {
  /** Whether the channel can delete a comment; Threads cannot. */
  canDelete: boolean
}

/**
 * "AI moderation" inside the Hide comments card: an AI agent's model reads
 * every comment before the reply filters and hides or deletes the ones in the
 * chosen categories. Shared by the four comment automation forms, which all
 * store it at `hideComments.aiModeration`.
 */
export function AIModerationField({ canDelete }: Props) {
  const t = useTranslations()
  const { control } = useFormContext()
  const { options: aiAgentOptions } = useAIAgentSelectOptions(useWorkspaceId())
  const enabled = useWatch({
    control,
    name: "hideComments.aiModeration.enabled",
  })
  const action = useWatch({ control, name: "hideComments.aiModeration.action" })

  return (
    <div className="space-y-3 rounded-md border p-3">
      <SwitchField
        description={t("commentAutomation.aiModeration.description")}
        label={t("commentAutomation.aiModeration.enabled")}
        name="hideComments.aiModeration.enabled"
      />
      {enabled && (
        <>
          <ComboboxField
            description={t("commentAutomation.aiModeration.aiAgentDescription")}
            emptyText={t("actions.noRecordFound")}
            label={t("fields.aiAgent.label")}
            name="hideComments.aiModeration.aiAgentId"
            options={aiAgentOptions}
            placeholder={t("actions.pleaseSelect")}
            required
          />
          <CheckboxGroupField
            label={t("commentAutomation.aiModeration.categoriesLabel")}
            name="hideComments.aiModeration.categories"
            options={commentModerationCategories.options.map((category) => ({
              value: category,
              label: t(categoryLabelKeys[category]),
              description: t(categoryDescriptionKeys[category]),
            }))}
            required
          />
          <TextareaField
            description={t(
              "commentAutomation.aiModeration.instructionDescription",
            )}
            label={t("commentAutomation.aiModeration.instruction")}
            maxLength={1000}
            name="hideComments.aiModeration.instruction"
            placeholder={t(
              "commentAutomation.aiModeration.instructionPlaceholder",
            )}
            rows={2}
          />
          {canDelete && (
            <RadioGroupField
              label={t("commentAutomation.aiModeration.action")}
              name="hideComments.aiModeration.action"
              options={[
                {
                  label: t("commentAutomation.aiModeration.actions.hide"),
                  value: "hide",
                },
                {
                  label: t("commentAutomation.aiModeration.actions.delete"),
                  value: "delete",
                },
              ]}
              orientation="horizontal"
              required
            />
          )}
          {canDelete && action === "delete" && (
            <p className="text-destructive text-sm">
              {t("commentAutomation.aiModeration.deleteWarning")}
            </p>
          )}
        </>
      )}
    </div>
  )
}
