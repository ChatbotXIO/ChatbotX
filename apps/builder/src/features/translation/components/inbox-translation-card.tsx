"use client"

import { aiChatProviders } from "@chatbotx.io/ai"
import type { AIAgentModelConfig } from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { Alert, AlertDescription } from "@chatbotx.io/ui/components/ui/alert"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useMemo, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { SettingRow } from "@/components/setting-row"
import { AIModelSelect } from "@/features/flows/react-flow/steps/ai-generate-text/components/ai-model-select"
import {
  buildOpenaiCompatibleIntegrationOptions,
  getOpenaiCompatibleIntegrationLabel,
} from "@/features/integration-openai-compatible/model-options"
import type { IntegrationOpenaiCompatibleResource } from "@/features/integration-openai-compatible/schema/resource"
import { testTranslationSettingsAction } from "../actions/test-settings.action"
import { updateTranslationSettingsAction } from "../actions/update-settings.action"
import {
  useInvalidateTranslation,
  useTranslationSettings,
} from "../hooks/use-translation-settings"
import type { TranslationSettingsResource } from "../schema/resource"

export type ConnectedAiProvider = {
  provider: "openai" | "gemini" | "claude" | "deepseek" | "openrouter" | "muse"
  label: string
}

type Props = {
  workspaceId: string
  /** Admins may change the settings; every other member sees them read-only. */
  canManage: boolean
  connectedProviders: ConnectedAiProvider[]
  openaiCompatibleIntegrations: IntegrationOpenaiCompatibleResource[]
}

const COMPATIBLE_PREFIX = "openaiCompatible:"

const formSchema = z.object({
  enabled: z.boolean(),
  /** A provider name, or `openaiCompatible:<integrationId>`. Empty: none chosen. */
  integration: z.string(),
  model: z.string(),
})
type FormValues = z.infer<typeof formSchema>

const toFormValues = (settings: TranslationSettingsResource): FormValues => {
  const config = settings.modelConfig
  if (!config) {
    return { enabled: settings.enabled, integration: "", model: "" }
  }
  return {
    enabled: settings.enabled,
    integration:
      "kind" in config
        ? `${COMPATIBLE_PREFIX}${config.integrationId}`
        : config.provider,
    model: config.model,
  }
}

/** The `modelConfig` the form describes, or `null` while it is incomplete. */
const toModelConfig = (
  values: Pick<FormValues, "integration" | "model">,
): AIAgentModelConfig | null => {
  const model = values.model.trim()
  if (!(values.integration && model)) {
    return null
  }
  if (values.integration.startsWith(COMPATIBLE_PREFIX)) {
    return {
      kind: "openaiCompatible",
      integrationId: values.integration.slice(COMPATIBLE_PREFIX.length),
      model,
    }
  }
  const provider = aiChatProviders.find(
    (candidate) => candidate.provider === values.integration,
  )?.provider
  return provider ? { provider, model } : null
}

/**
 * Settings → General → "Conversation translation". One card = one form = one
 * action, like its siblings; it writes a different table through a different
 * service and needs admin rights, so it is not folded into the Advanced card.
 * It maps 1:1 to the public `translation.updateSettings`.
 */
export function InboxTranslationCard(props: Props) {
  const { data: settings } = useTranslationSettings()
  if (!settings) {
    return (
      <Card>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    )
  }
  return <TranslationSettingsForm {...props} settings={settings} />
}

function TranslationSettingsForm(
  props: Props & { settings: TranslationSettingsResource },
) {
  const {
    workspaceId,
    canManage,
    connectedProviders,
    openaiCompatibleIntegrations,
    settings,
  } = props
  const t = useTranslations("inboxTranslation.settings")
  const tc = useTranslations()
  const invalidate = useInvalidateTranslation()
  const [testResult, setTestResult] = useState<
    | {
        kind: "ok"
        latencyMs: number
        slow: boolean
        sample: string
        translated: string
      }
    | { kind: "error"; message: string }
    | null
  >(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(settings),
    mode: "onChange",
  })
  const values = useWatch({ control: form.control })
  const integration = values.integration ?? ""
  const modelConfig = toModelConfig({
    integration,
    model: values.model ?? "",
  })

  const integrationOptions = useMemo<SelectOption[]>(
    () => [
      ...connectedProviders.map((provider) => ({
        value: provider.provider,
        label: provider.label,
      })),
      ...buildOpenaiCompatibleIntegrationOptions({
        integrations: openaiCompatibleIntegrations,
      }).map((option) => ({
        ...option,
        value: `${COMPATIBLE_PREFIX}${option.value}`,
      })),
    ],
    [connectedProviders, openaiCompatibleIntegrations],
  )
  const compatibleIntegration = integration.startsWith(COMPATIBLE_PREFIX)
    ? openaiCompatibleIntegrations.find(
        (candidate) =>
          candidate.id === integration.slice(COMPATIBLE_PREFIX.length),
      )
    : undefined

  const { execute: save, isPending: isSaving } = useAction(
    updateTranslationSettingsAction.bind(null, workspaceId),
    {
      onSuccess: async () => {
        await invalidate()
        toast.success(t("saved"))
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )
  const { execute: test, isPending: isTesting } = useAction(
    testTranslationSettingsAction.bind(null, workspaceId),
    {
      onSuccess: ({ data }) => {
        if (data) {
          setTestResult({
            kind: "ok",
            latencyMs: data.latencyMs,
            slow: data.slow,
            sample: data.sampleText,
            translated: data.translatedText,
          })
        }
      },
      onError: ({ error }) =>
        setTestResult({
          kind: "error",
          message: error.serverError ?? t("test.failed"),
        }),
    },
  )

  const hasNoIntegration = integrationOptions.length === 0
  const submit = () => {
    save({ enabled: values.enabled === true, modelConfig })
  }

  // A new integration starts from its own default model.
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name !== "integration") {
        return
      }
      const next = value.integration ?? ""
      const compatible = openaiCompatibleIntegrations.find(
        (candidate) => `${COMPATIBLE_PREFIX}${candidate.id}` === next,
      )
      const builtIn = aiChatProviders.find(
        (candidate) => candidate.provider === next,
      )
      form.setValue(
        "model",
        compatible?.defaultModel ?? builtIn?.defaultModel ?? "",
        { shouldValidate: true },
      )
      setTestResult(null)
    })
    return () => subscription.unsubscribe()
  }, [form, openaiCompatibleIntegrations])

  return (
    <Card>
      <CardContent>
        <Form {...form}>
          <form
            className="flex flex-col gap-2"
            onSubmit={form.handleSubmit(submit)}
          >
            <div className="mb-1">
              <h3 className="font-medium text-base">{t("title")}</h3>
              <p className="text-muted-foreground text-sm">
                {t("description")}
              </p>
            </div>

            {settings.status === "needsReconfiguration" && (
              <Alert variant="destructive">
                <AlertDescription>
                  {t("alert.needsReconfiguration")}
                </AlertDescription>
              </Alert>
            )}
            {hasNoIntegration && canManage && (
              <Alert>
                <AlertDescription>
                  {t("alert.noIntegration")}{" "}
                  <Link
                    className="underline"
                    href={`/space/${workspaceId}/settings/integrations`}
                  >
                    {t("alert.connect")}
                  </Link>
                </AlertDescription>
              </Alert>
            )}

            <SettingRow
              description={t("enabled.description")}
              label={t("enabled.label")}
            >
              <SwitchField
                className="mt-1.5"
                disabled={!canManage}
                name="enabled"
              />
            </SettingRow>

            <SettingRow
              description={t("integration.description")}
              label={t("integration.label")}
            >
              <ComboboxField
                disabled={!canManage}
                emptyText={tc("actions.noRecordFound")}
                name="integration"
                options={integrationOptions}
                placeholder={tc("actions.pleaseSelect")}
              />
            </SettingRow>

            {integration && (
              <SettingRow label={tc("fields.model.label")}>
                {compatibleIntegration ? (
                  <InputField
                    disabled={!canManage}
                    name="model"
                    placeholder={getOpenaiCompatibleIntegrationLabel(
                      compatibleIntegration,
                    )}
                  />
                ) : (
                  <AIModelSelect
                    disabled={!canManage}
                    name="model"
                    provider={
                      aiChatProviders.find(
                        (candidate) => candidate.provider === integration,
                      )?.provider ?? "openai"
                    }
                  />
                )}
              </SettingRow>
            )}

            {canManage && (
              <SettingRow label={t("test.label")}>
                <div className="flex flex-col gap-1.5">
                  <Button
                    disabled={!modelConfig || isTesting}
                    onClick={() => {
                      setTestResult(null)
                      if (modelConfig) {
                        test({ modelConfig })
                      }
                    }}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    {isTesting && <Loader2Icon className="animate-spin" />}
                    {t("test.button")}
                  </Button>
                  {testResult?.kind === "ok" && (
                    <p className="text-sm">
                      {t("test.result", {
                        seconds: (testResult.latencyMs / 1000).toFixed(1),
                        sample: testResult.sample,
                        translated: testResult.translated,
                      })}
                    </p>
                  )}
                  {testResult?.kind === "ok" && testResult.slow && (
                    <p className="text-amber-700 text-sm dark:text-amber-400">
                      {t("test.slow")}
                    </p>
                  )}
                  {testResult?.kind === "error" && (
                    <p className="text-destructive text-sm">
                      {testResult.message}
                    </p>
                  )}
                </div>
              </SettingRow>
            )}

            {canManage ? (
              <div className="mt-4 flex flex-start">
                <Button disabled={isSaving} size="sm" type="submit">
                  {isSaving && <Loader2Icon className="animate-spin" />}
                  {tc("actions.confirm")}
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">{t("readOnly")}</p>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
