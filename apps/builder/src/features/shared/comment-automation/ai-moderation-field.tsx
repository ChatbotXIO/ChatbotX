"use client"

import {
  COMMENT_MODERATION_DECISION_INSTRUCTION_MAX_LENGTH,
  COMMENT_MODERATION_INSTRUCTION_MAX_LENGTH,
  type CommentModerationCategory,
  commentModerationCategories,
} from "@chatbotx.io/database/partials"
import { CheckboxGroupField } from "@chatbotx.io/ui/components/form/checkbox-group-field"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { RadioGroupField } from "@chatbotx.io/ui/components/form/radio-group-field"
import { SliderField } from "@chatbotx.io/ui/components/form/slider-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useMemo } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { useAIAgentSelectOptions } from "@/features/ai-agents/hooks/use-ai-agents"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"

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
 * The AI Router (Decision) engine's controls: which enabled connection, which
 * of its models, and the probability that counts as a match. Picking another
 * connection moves the model to one that connection actually has.
 */
function DecisionEngineFields() {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const { control, getValues, setValue } = useFormContext()
  const { data: connections, isSuccess } = useQuery(
    orpc.decisionConnectionsAPI.listEnabled.queryOptions({
      input: { workspaceId: workspaceId ?? "" },
      enabled: Boolean(workspaceId),
    }),
  )
  const connectionId = useWatch({
    control,
    name: "hideComments.aiModeration.decisionConnectionId",
  })
  const connection = connections?.find((item) => item.id === connectionId)

  useEffect(() => {
    if (!connection) {
      return
    }
    const model = getValues("hideComments.aiModeration.decisionModel")
    // Not `shouldDirty`: opening a saved automation whose model left the
    // catalog must not mark the form changed; a connection the user picks is
    // already dirty.
    if (!connection.modelCatalog.includes(model)) {
      setValue(
        "hideComments.aiModeration.decisionModel",
        connection.defaultModel ?? connection.modelCatalog[0] ?? null,
      )
    }
  }, [connection, getValues, setValue])

  const connectionOptions = useMemo(
    () =>
      (connections ?? []).map((item) => ({ value: item.id, label: item.name })),
    [connections],
  )
  const modelOptions = useMemo(
    () =>
      (connection?.modelCatalog ?? []).map((model) => ({
        value: model,
        label: model,
      })),
    [connection],
  )

  return (
    <>
      {/* The field stays rendered so its required error shows on save. */}
      {isSuccess && connectionOptions.length === 0 && (
        <p className="text-muted-foreground text-sm">
          {t("commentAutomation.aiModeration.noDecisionConnection")}{" "}
          <Link
            className="text-primary underline"
            href={`/space/${workspaceId}/settings/integrations/decision-connections`}
          >
            {t("commentAutomation.aiModeration.addDecisionConnection")}
          </Link>
        </p>
      )}
      <ComboboxField
        description={t(
          "commentAutomation.aiModeration.decisionConnectionDescription",
        )}
        emptyText={t("actions.noRecordFound")}
        label={t("commentAutomation.aiModeration.decisionConnection")}
        name="hideComments.aiModeration.decisionConnectionId"
        options={connectionOptions}
        placeholder={t("actions.pleaseSelect")}
        required
      />
      {isSuccess && connectionId && !connection && (
        <p className="text-destructive text-sm">
          {t("commentAutomation.aiModeration.decisionConnectionUnavailable")}
        </p>
      )}
      {connection && (
        <ComboboxField
          emptyText={t("actions.noRecordFound")}
          label={t("commentAutomation.aiModeration.decisionModel")}
          name="hideComments.aiModeration.decisionModel"
          options={modelOptions}
          placeholder={t("actions.pleaseSelect")}
          required
        />
      )}
      <SliderField
        description={t(
          "commentAutomation.aiModeration.decisionThresholdDescription",
        )}
        label={t("commentAutomation.aiModeration.decisionThreshold")}
        max={0.95}
        min={0.5}
        name="hideComments.aiModeration.decisionThreshold"
        step={0.05}
      />
    </>
  )
}

/**
 * "AI moderation" inside the Hide comments card: an AI agent's model — or an
 * AI Router connection such as Jev — reads every comment before the reply
 * filters and hides or deletes the ones in the chosen categories. Shared by
 * the four comment automation forms, which all store it at
 * `hideComments.aiModeration`.
 */
export function AIModerationField({ canDelete }: Props) {
  const t = useTranslations()
  const { control } = useFormContext()
  const { options: aiAgentOptions } = useAIAgentSelectOptions(useWorkspaceId())
  const enabled = useWatch({
    control,
    name: "hideComments.aiModeration.enabled",
  })
  const engine =
    useWatch({ control, name: "hideComments.aiModeration.engine" }) ?? "aiAgent"
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
          <RadioGroupField
            label={t("commentAutomation.aiModeration.engine")}
            name="hideComments.aiModeration.engine"
            options={[
              {
                label: t("commentAutomation.aiModeration.engines.aiAgent"),
                value: "aiAgent",
              },
              {
                label: t("commentAutomation.aiModeration.engines.decision"),
                value: "decision",
              },
            ]}
            orientation="horizontal"
            required
          />
          {engine === "decision" ? (
            <DecisionEngineFields />
          ) : (
            <ComboboxField
              description={t(
                "commentAutomation.aiModeration.aiAgentDescription",
              )}
              emptyText={t("actions.noRecordFound")}
              label={t("fields.aiAgent.label")}
              name="hideComments.aiModeration.aiAgentId"
              options={aiAgentOptions}
              placeholder={t("actions.pleaseSelect")}
              required
            />
          )}
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
            maxLength={
              engine === "decision"
                ? COMMENT_MODERATION_DECISION_INSTRUCTION_MAX_LENGTH
                : COMMENT_MODERATION_INSTRUCTION_MAX_LENGTH
            }
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
