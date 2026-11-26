"use client"

import { aiChatProviders } from "@chatbotx.io/ai"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { type ReactNode, useEffect, useMemo, useRef } from "react"
import { useForm } from "react-hook-form"
import { AIModelSelect } from "@/features/flows/react-flow/steps/ai-generate-text/components/ai-model-select"
import { listAiIntegrationsAction } from "@/features/social-posts-ai/actions/list-ai-integrations.action"
import {
  type AiIntegrationOption,
  buildAiIntegrationOptions,
  choiceAfterRefetch,
  defaultAiChoice,
  readStoredChoice,
  writeStoredChoice,
} from "@/features/social-posts-ai/integration-options"
import type { AiModelChoice } from "@/features/social-posts-ai/model-choice"

type PickerValues = { integration: string; model: string }

const LIST_STALE_TIME_MS = 60 * 1000

/**
 * The AI integration and model "Write with AI" writes with. It reuses the
 * flow AI step's model select; the choice is remembered per workspace and, with
 * exactly one integration, picked for the member. It reports `null` until both
 * an integration and a model are chosen (always, when the workspace has no AI
 * integration: it then links to the integrations settings). `initialChoice`
 * (read once, on mount) is a choice already saved elsewhere: it wins over the
 * remembered one, so opening an existing record never replaces its model.
 */
export const AiModelPicker = ({
  initialChoice = null,
  onChange,
  workspaceId,
}: {
  initialChoice?: AiModelChoice | null
  onChange: (choice: AiModelChoice | null) => void
  workspaceId: string
}) => {
  const t = useTranslations()
  const savedChoice = useRef(initialChoice)
  const form = useForm<PickerValues>({
    defaultValues: { integration: "", model: "" },
  })
  const integrations = useQuery({
    queryFn: async () => {
      const result = await listAiIntegrationsAction(workspaceId)
      if (result?.serverError || result?.validationErrors) {
        // Reach the query's error state instead of showing an empty picker.
        throw new Error(result.serverError ?? "Invalid request")
      }
      return result?.data ?? { openaiCompatible: [], providers: [] }
    },
    queryKey: ["composer-ai-integrations", workspaceId],
    staleTime: LIST_STALE_TIME_MS,
  })
  const options = useMemo<AiIntegrationOption[]>(
    () =>
      buildAiIntegrationOptions({
        openaiCompatible: integrations.data?.openaiCompatible ?? [],
        providers: integrations.data?.providers ?? [],
      }),
    [integrations.data],
  )

  // Start from the saved choice, else the remembered one, else the single
  // integration. Only the first read starts that way: a later refetch keeps
  // the member's pick unless its integration is gone.
  const started = useRef(false)
  useEffect(() => {
    if (!integrations.data) {
      return
    }
    const stored = readStoredChoice(workspaceId)
    let start: AiModelChoice | null
    if (started.current) {
      const { integration, model } = form.getValues()
      start = choiceAfterRefetch(
        options,
        stored,
        integration && model ? { integrationId: integration, model } : null,
      )
    } else {
      start = defaultAiChoice(options, stored, savedChoice.current)
    }
    started.current = true
    if (start) {
      form.reset({ integration: start.integrationId, model: start.model })
      onChange(start)
    }
  }, [integrations.data, options, workspaceId, form, onChange])

  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      let model = value.model ?? ""
      if (name === "integration") {
        model =
          options.find((option) => option.value === value.integration)
            ?.defaultModel ?? ""
        form.setValue("model", model)
      }
      const integration = value.integration ?? ""
      const choice =
        integration && model.trim()
          ? { integrationId: integration, model: model.trim() }
          : null
      if (choice) {
        writeStoredChoice(workspaceId, choice)
      }
      onChange(choice)
    })
    return () => subscription.unsubscribe()
  }, [form, onChange, options, workspaceId])

  // The reset above fires the watcher; this covers a start that equals the defaults.
  const integration = form.watch("integration")

  if (integrations.isPending) {
    return <Skeleton className="h-16 w-full" />
  }
  if (integrations.isError) {
    return (
      <p className="text-destructive text-sm">
        {t("messages.errorLoadingData")}{" "}
        <button
          className="underline"
          onClick={() => integrations.refetch()}
          type="button"
        >
          {t("actions.retry")}
        </button>
      </p>
    )
  }
  if (options.length === 0) {
    return (
      <p className="text-amber-700 text-sm dark:text-amber-400">
        {t("composer.aiNoIntegration")}{" "}
        <Link
          className="underline"
          href={`/space/${workspaceId}/settings/integrations`}
        >
          {t("composer.aiConnectIntegration")}
        </Link>
      </p>
    )
  }
  const builtInProvider = aiChatProviders.find(
    (candidate) => candidate.provider === integration,
  )?.provider
  let modelField: ReactNode = null
  if (builtInProvider) {
    modelField = <AIModelSelect name="model" provider={builtInProvider} />
  } else if (integration) {
    modelField = <InputField label={t("fields.model.label")} name="model" />
  }
  return (
    <Form {...form}>
      <div className="space-y-2">
        <ComboboxField
          emptyText={t("actions.noRecordFound")}
          label={t("composer.aiIntegration")}
          name="integration"
          options={options}
          placeholder={t("actions.pleaseSelect")}
        />
        {modelField}
      </div>
    </Form>
  )
}
