"use client"

import type { DecisionConnectionSafe } from "@chatbotx.io/business"
import type { DecisionProfileModel } from "@chatbotx.io/database/types"
import {
  type GlobalRouterDestination,
  globalRouterConfigSchema,
} from "@chatbotx.io/decision-config"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Alert, AlertDescription } from "@chatbotx.io/ui/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@chatbotx.io/ui/components/ui/form"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  RadioGroup,
  RadioGroupItem,
} from "@chatbotx.io/ui/components/ui/radio-group"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  AlertTriangleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useRef, useState } from "react"
import { useFieldArray, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { createDecisionProfileAction } from "@/features/decision-profiles/actions/create-decision-profile.action"
import { updateDecisionProfileAction } from "@/features/decision-profiles/actions/update-decision-profile.action"
import { useWorkspaceId } from "@/hooks/routing"
import { useInvalidateDecisionProfiles } from "../hooks/use-decision-profiles"
import {
  type DecisionProfileForm,
  decisionProfileFormSchema,
  decisionProfileStoredContractSchema,
} from "../schema/form"
import { GlobalRouterSettings } from "./global-router-settings"

const choiceDecisionDefaults = () => ({
  instructions: "",
  options: [
    { description: "", value: "" },
    { description: "", value: "other" },
  ],
  type: "choice" as const,
})

const decisionDefaults = (type: DecisionProfileForm["decision"]["type"]) => {
  if (type === "choice") {
    return choiceDecisionDefaults()
  }
  if (type === "score") {
    return {
      instructions: "",
      levels: Array.from({ length: 5 }, () => ({ description: "" })),
      type: "score" as const,
    }
  }
  return {
    falseCriteria: "",
    instructions: "",
    trueCriteria: "",
    type: "noul" as const,
  }
}

const defaults = (): DecisionProfileForm => ({
  connectionId: "",
  decision: choiceDecisionDefaults(),
  description: null,
  globalRouterConfig: null,
  globalRouterEnabled: false,
  model: "",
  name: "",
  status: "enabled",
  thresholdConfig: null,
})

export const normalizeDecisionProfileForm = (
  values: DecisionProfileForm,
): DecisionProfileForm => {
  const { decision, ...profile } = values
  const globalRouter =
    profile.globalRouterEnabled && profile.globalRouterConfig
      ? {
          ...profile.globalRouterConfig,
          fallback: {
            ...profile.globalRouterConfig.fallback,
            type:
              (
                profile.globalRouterConfig
                  .fallback as Partial<GlobalRouterDestination>
              ).type ?? "flow",
          } as GlobalRouterDestination,
          metadataMappings:
            profile.globalRouterConfig.metadataMappings?.filter((mapping) =>
              Boolean(mapping.customFieldId?.trim()),
            ) ?? [],
        }
      : null
  if (decision.type === "choice") {
    return {
      ...profile,
      globalRouterConfig: globalRouter,
      decision: {
        instructions: decision.instructions,
        options: decision.options,
        type: "choice",
      },
    }
  }
  if (decision.type === "score") {
    return {
      ...profile,
      globalRouterConfig: globalRouter,
      decision: {
        instructions: decision.instructions,
        levels: decision.levels,
        type: "score",
      },
    }
  }
  return {
    ...profile,
    globalRouterConfig: globalRouter,
    decision: {
      falseCriteria: decision.falseCriteria,
      instructions: decision.instructions,
      trueCriteria: decision.trueCriteria,
      type: "noul",
    },
  }
}

const isDefaultDecision = (decision: DecisionProfileForm["decision"]) =>
  JSON.stringify(decision) === JSON.stringify(decisionDefaults(decision.type))

const noulInstructionLength = (decision: DecisionProfileForm["decision"]) =>
  decision.type === "noul"
    ? `${decision.instructions}\n\nTRUE when:\n${decision.trueCriteria}\n\nFALSE when:\n${decision.falseCriteria}`
        .length
    : 0

const thresholdLabelKeyByDecisionType = {
  choice: "decision.thresholdChoice",
  noul: "decision.thresholdNoul",
  score: "decision.thresholdScore",
} as const

const statusLabelKeyByValue = {
  disabled: "decision.status.inactive",
  enabled: "decision.status.active",
} as const

const errorMessageAt = (errors: unknown, path: string) => {
  const error = path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") {
      return null
    }
    return (current as Record<string, unknown>)[segment]
  }, errors)
  if (!error || typeof error !== "object") {
    return
  }
  const message = (error as { message?: unknown }).message
  return typeof message === "string" ? message : undefined
}

const validationMessages = (
  issues: { message: string; path: PropertyKey[] }[],
) =>
  Object.fromEntries(
    issues
      .filter((issue) => issue.path.length > 0)
      .map((issue) => [issue.path.join("."), issue.message]),
  )

function NestedFieldError({ message }: { message?: string }) {
  return message ? (
    <p className="text-destructive text-sm" data-slot="nested-field-error">
      {message}
    </p>
  ) : null
}

const fromProfile = (profile: DecisionProfileModel): DecisionProfileForm => {
  const question = decisionProfileStoredContractSchema.parse(profile.contract)
    .questions[0]
  if (!question) {
    return defaults()
  }
  const common = {
    connectionId: profile.connectionId,
    description: profile.description,
    globalRouterConfig:
      globalRouterConfigSchema.safeParse(profile.globalRouterConfig).data ??
      null,
    globalRouterEnabled: profile.globalRouterEnabled,
    model: profile.model,
    name: profile.name,
    status: profile.status,
    thresholdConfig: profile.thresholdConfig ?? null,
  } as const
  if (question.type === "choice") {
    return {
      ...common,
      decision: {
        instructions: question.instructions,
        options: question.options.map(({ description, value }) => ({
          description,
          value,
        })),
        type: "choice",
      },
    }
  }
  if (question.type === "score") {
    return {
      ...common,
      decision: {
        instructions: question.instructions,
        levels: question.levels.map(({ description }) => ({ description })),
        type: "score",
      },
    }
  }
  return {
    ...common,
    decision: {
      falseCriteria: question.falseCriteria,
      instructions: question.instructions,
      trueCriteria: question.trueCriteria,
      type: "noul",
    },
  }
}

type Props = {
  connections: DecisionConnectionSafe[]
  onClose: () => void
  profile?: DecisionProfileModel
}

export function ProfileEditor({ connections, onClose, profile }: Props) {
  const workspaceId = useWorkspaceId()
  const router = useRouter()
  const invalidateDecisionProfiles = useInvalidateDecisionProfiles()
  const t = useTranslations()
  const isEditing = Boolean(profile)
  const enabledConnections = connections.filter(
    (connection) => connection.status === "enabled",
  )
  const form = useForm<DecisionProfileForm>({
    defaultValues: profile
      ? fromProfile(profile)
      : {
          ...defaults(),
          connectionId: enabledConnections[0]?.id ?? "",
          model: enabledConnections[0]?.defaultModel ?? "",
        },
    mode: "onChange",
    resolver: zodResolver(decisionProfileFormSchema),
  })
  const globalRouterEnabled = useWatch({
    control: form.control,
    name: "globalRouterEnabled",
  })
  let selectableConnections = enabledConnections
  if (profile) {
    selectableConnections = connections.filter(
      (connection) =>
        connection.status === "enabled" ||
        connection.id === profile.connectionId,
    )
  } else if (globalRouterEnabled) {
    selectableConnections = connections
  }
  const decision = useWatch({ control: form.control, name: "decision" })
  const connectionId = useWatch({ control: form.control, name: "connectionId" })
  const selectedConnection = connections.find(
    (connection) => connection.id === connectionId,
  )
  const choiceFields = useFieldArray({
    control: form.control,
    name: "decision.options" as never,
  })
  const scoreFields = useFieldArray({
    control: form.control,
    name: "decision.levels" as never,
  })
  const [pendingDecisionType, setPendingDecisionType] = useState<
    DecisionProfileForm["decision"]["type"] | null
  >(null)
  const [submittedErrors, setSubmittedErrors] = useState<
    Record<string, string>
  >({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const previousConnectionId = useRef(connectionId)
  const model = form.watch("model")
  const connectionIsAvailable = selectedConnection?.status === "enabled"
  const modelIsAvailable = Boolean(
    selectedConnection?.modelCatalog.includes(model),
  )
  const thresholdConfig = useWatch({
    control: form.control,
    name: "thresholdConfig",
  })
  const fieldErrors = form.formState.errors
  const messageFor = (path: string) =>
    submittedErrors[path] ?? errorMessageAt(fieldErrors, path)
  const thresholdLabel = t(thresholdLabelKeyByDecisionType[decision.type])
  const scoreMaximum = decision.type === "score" ? decision.levels.length : 10

  useEffect(() => {
    if (
      !selectedConnection ||
      previousConnectionId.current === selectedConnection.id
    ) {
      return
    }
    previousConnectionId.current = selectedConnection.id
    form.setValue(
      "model",
      selectedConnection.defaultModel ??
        (selectedConnection.modelCatalog.length === 1
          ? (selectedConnection.modelCatalog[0] ?? "")
          : ""),
      { shouldDirty: true, shouldValidate: true },
    )
  }, [form, selectedConnection])

  const applyDecisionType = (type: DecisionProfileForm["decision"]["type"]) => {
    const nextDecision = decisionDefaults(type)
    form.clearErrors("decision")
    form.clearErrors("thresholdConfig")
    setSubmittedErrors({})
    form.setValue("decision", nextDecision, {
      shouldDirty: true,
    })
    if (nextDecision.type === "choice") {
      choiceFields.replace(nextDecision.options as never)
    }
    if (nextDecision.type === "score") {
      scoreFields.replace(nextDecision.levels as never)
    }
    form.setValue("thresholdConfig", null, {
      shouldDirty: true,
    })
    const globalRouterConfig = form.getValues("globalRouterConfig")
    if (globalRouterConfig) {
      form.setValue(
        "globalRouterConfig",
        { ...globalRouterConfig, metadataMappings: [], routes: [] },
        { shouldDirty: true, shouldValidate: true },
      )
    }
    setPendingDecisionType(null)
  }

  const requestDecisionType = (
    type: DecisionProfileForm["decision"]["type"],
  ) => {
    if (type === decision.type) {
      return
    }
    if (isDefaultDecision(decision) && !form.getValues("thresholdConfig")) {
      applyDecisionType(type)
      return
    }
    setPendingDecisionType(type)
  }

  const success = () => {
    setSubmitError(null)
    toast.success(
      t(isEditing ? "messages.updatedSuccess" : "messages.createdSuccess", {
        feature: t("decision.profile"),
      }),
    )
    invalidateDecisionProfiles()
    onClose()
    router.refresh()
  }
  const error = ({ error }: { error: { serverError?: string } }) => {
    const message = error.serverError ?? t("messages.unknownError")
    setSubmitError(message)
    toast.error(message)
  }
  const { execute: create, isPending: creating } = useAction(
    createDecisionProfileAction.bind(null, workspaceId),
    { onError: error, onSuccess: success },
  )
  const { execute: update, isPending: updating } = useAction(
    updateDecisionProfileAction.bind(null, workspaceId),
    { onError: error, onSuccess: success },
  )
  const submit = () => {
    setSubmitError(null)
    const parsed = decisionProfileFormSchema.safeParse(
      normalizeDecisionProfileForm(form.getValues()),
    )
    if (!parsed.success) {
      setSubmittedErrors(validationMessages(parsed.error.issues))
      form.trigger(undefined, { shouldFocus: true })
      return
    }
    setSubmittedErrors({})
    if (profile) {
      update({ ...parsed.data, id: profile.id })
      return
    }
    create(parsed.data)
  }

  return (
    <Form {...form}>
      <form
        className="space-y-6"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <section className="space-y-4">
          <h3 className="font-semibold">{t("general.title")}</h3>
          <InputField label={t("fields.name.label")} name="name" required />
          <TextareaField
            description={t("decision.profileDescription")}
            label={t("fields.description.label")}
            name="description"
            rows={2}
          />
          <SelectField
            label={t("decision.connection")}
            name="connectionId"
            options={selectableConnections.map((connection) => ({
              disabled: connection.status !== "enabled" && !globalRouterEnabled,
              label: connection.name,
              value: connection.id,
            }))}
            required
          />
          {!connectionIsAvailable && selectedConnection && (
            <Alert variant="warning">
              <AlertTriangleIcon />
              <AlertDescription>
                {t("decision.connectionUnavailable")}
              </AlertDescription>
            </Alert>
          )}
          <SelectField
            disabled={
              selectedConnection?.modelCatalog.length === 1 && modelIsAvailable
            }
            label={t("decision.model")}
            name="model"
            options={[
              ...(model && !modelIsAvailable
                ? [{ disabled: true, label: model, value: model }]
                : []),
              ...(selectedConnection?.modelCatalog ?? []).map((model) => ({
                label: model,
                value: model,
              })),
            ]}
            required
          />
          {!modelIsAvailable && selectedConnection && (
            <Alert variant="warning">
              <AlertTriangleIcon />
              <AlertDescription>
                {t("decision.modelUnavailable")}
              </AlertDescription>
            </Alert>
          )}
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("decision.status.label")}</FormLabel>
                <div className="flex items-center gap-2">
                  <FormControl>
                    <Switch
                      aria-label={t("decision.status.label")}
                      checked={field.value === "enabled"}
                      onCheckedChange={(enabled) =>
                        field.onChange(enabled ? "enabled" : "disabled")
                      }
                    />
                  </FormControl>
                  <span className="text-sm">
                    {t(
                      statusLabelKeyByValue[
                        field.value === "enabled" ? "enabled" : "disabled"
                      ],
                    )}
                  </span>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>
        <section className="space-y-4 border-t pt-5">
          <h3 className="font-semibold">{t("decision.question")}</h3>
          <RadioGroup
            className="flex flex-wrap gap-4"
            onValueChange={(value) => {
              if (value === "choice" || value === "score" || value === "noul") {
                requestDecisionType(value)
              }
            }}
            value={decision.type}
          >
            {(
              [
                ["choice", t("decision.resultValues.choice")],
                ["score", t("decision.resultValues.score")],
                ["noul", t("decision.resultValues.noul")],
              ] as const
            ).map(([value, label]) => (
              <div className="flex items-center gap-2" key={value}>
                <RadioGroupItem id={`decision-type-${value}`} value={value} />
                <Label
                  className="font-normal"
                  htmlFor={`decision-type-${value}`}
                >
                  {label}
                </Label>
              </div>
            ))}
          </RadioGroup>
          <TextareaField
            hideMessage
            label={
              decision.type === "noul"
                ? t("decision.statement")
                : t("decision.question")
            }
            name="decision.instructions"
            required
            rows={3}
          />
          <NestedFieldError message={messageFor("decision.instructions")} />
        </section>
        <section className="space-y-3 border-t pt-5">
          <h3 className="font-semibold">{t("decision.result")}</h3>
          {decision.type === "choice" &&
            choiceFields.fields.map((field, index) => (
              <div className="flex items-end gap-2" key={field.id}>
                <div className="min-w-0 flex-1">
                  <InputField
                    hideMessage
                    label={t("decision.resultValues.choice")}
                    name={`decision.options.${index}.value` as never}
                    required
                  />
                  <NestedFieldError
                    message={messageFor(`decision.options.${index}.value`)}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <TextareaField
                    hideMessage
                    label={t("fields.description.label")}
                    name={`decision.options.${index}.description` as never}
                    required
                    rows={1}
                  />
                  <NestedFieldError
                    message={messageFor(
                      `decision.options.${index}.description`,
                    )}
                  />
                </div>
                <Button
                  aria-label={t("actions.delete")}
                  className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={choiceFields.fields.length <= 2}
                  onClick={() => choiceFields.remove(index)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Trash2Icon />
                </Button>
                <div className="flex shrink-0 flex-col">
                  <Button
                    aria-label={t("actions.moveUp")}
                    disabled={index === 0}
                    onClick={() => choiceFields.move(index, index - 1)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    aria-label={t("actions.moveDown")}
                    disabled={index === choiceFields.fields.length - 1}
                    onClick={() => choiceFields.move(index, index + 1)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <ArrowDownIcon />
                  </Button>
                </div>
              </div>
            ))}
          {decision.type === "choice" && (
            <Button
              disabled={choiceFields.fields.length >= 24}
              onClick={() =>
                choiceFields.append({ description: "", value: "" } as never)
              }
              size="sm"
              type="button"
              variant="outline"
            >
              <PlusIcon />
              {t("actions.addMore")}
            </Button>
          )}
          {decision.type === "score" &&
            scoreFields.fields.map((field, index) => (
              <div className="flex items-center gap-2" key={field.id}>
                <div className="me-2 flex w-8 shrink-0 flex-col items-center justify-center gap-1 self-stretch text-sm">
                  <span className="text-muted-foreground text-xs">
                    {t("fields.number.label")}
                  </span>
                  <span>{index + 1}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <TextareaField
                    hideMessage
                    label={t("fields.description.label")}
                    name={`decision.levels.${index}.description` as never}
                    required
                    rows={1}
                  />
                  <NestedFieldError
                    message={messageFor(`decision.levels.${index}.description`)}
                  />
                </div>
                <Button
                  aria-label={t("actions.delete")}
                  className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={scoreFields.fields.length <= 2}
                  onClick={async () => {
                    scoreFields.remove(index)
                    await form.trigger("thresholdConfig")
                  }}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Trash2Icon />
                </Button>
                <div className="flex shrink-0 flex-col">
                  <Button
                    aria-label={t("actions.moveUp")}
                    disabled={index === 0}
                    onClick={async () => {
                      scoreFields.move(index, index - 1)
                      await form.trigger("thresholdConfig")
                    }}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    aria-label={t("actions.moveDown")}
                    disabled={index === scoreFields.fields.length - 1}
                    onClick={async () => {
                      scoreFields.move(index, index + 1)
                      await form.trigger("thresholdConfig")
                    }}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <ArrowDownIcon />
                  </Button>
                </div>
              </div>
            ))}
          {decision.type === "score" && (
            <Button
              disabled={scoreFields.fields.length >= 10}
              onClick={async () => {
                scoreFields.append({ description: "" } as never)
                await form.trigger("thresholdConfig")
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <PlusIcon />
              {t("actions.addMore")}
            </Button>
          )}
          {decision.type === "noul" && (
            <>
              <TextareaField
                hideMessage
                label={t("fields.boolean.true")}
                name="decision.trueCriteria"
                required
                rows={2}
              />
              <NestedFieldError message={messageFor("decision.trueCriteria")} />
              <TextareaField
                hideMessage
                label={t("fields.boolean.false")}
                name="decision.falseCriteria"
                required
                rows={2}
              />
              <NestedFieldError
                message={messageFor("decision.falseCriteria")}
              />
              <p
                className={
                  noulInstructionLength(decision) > 1000
                    ? "text-destructive text-sm"
                    : "text-muted-foreground text-sm"
                }
              >
                {t("decision.charactersRemaining", {
                  count: Math.max(0, 1000 - noulInstructionLength(decision)),
                })}
              </p>
            </>
          )}
        </section>
        <section className="space-y-2 border-t pt-5">
          <h3 className="font-semibold">{t("decision.thresholds")}</h3>
          <div className="flex items-center gap-2">
            <Switch
              aria-label={t("decision.thresholds")}
              checked={Boolean(thresholdConfig)}
              onCheckedChange={(enabled) => {
                if (!enabled) {
                  form.setValue("thresholdConfig", null, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                } else if (decision.type === "score") {
                  form.setValue(
                    "thresholdConfig",
                    {
                      operator: "gte",
                      type: "score",
                      value: Math.min(3.5, decision.levels.length),
                    },
                    {
                      shouldDirty: true,
                      shouldValidate: true,
                    },
                  )
                } else if (decision.type === "noul") {
                  form.setValue(
                    "thresholdConfig",
                    {
                      minimum: 0.8,
                      type: "noul_true_probability",
                    },
                    {
                      shouldDirty: true,
                      shouldValidate: true,
                    },
                  )
                } else {
                  form.setValue(
                    "thresholdConfig",
                    {
                      minimum: 0.75,
                      type: "choice_confidence",
                    },
                    {
                      shouldDirty: true,
                      shouldValidate: true,
                    },
                  )
                }
              }}
            />
            <span className="text-sm">{thresholdLabel}</span>
          </div>
          {thresholdConfig?.type === "choice_confidence" && (
            <InputNumberField
              decimalScale={2}
              label={t("decision.resultValues.confidence")}
              max={1}
              min={0}
              name="thresholdConfig.minimum"
              stepper={0.01}
            />
          )}
          {thresholdConfig?.type === "noul_true_probability" && (
            <InputNumberField
              decimalScale={2}
              label={t("decision.resultValues.probability")}
              max={1}
              min={0}
              name="thresholdConfig.minimum"
              stepper={0.01}
            />
          )}
          {thresholdConfig?.type === "score" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label={t("fields.operator.label")}
                name="thresholdConfig.operator"
                options={[
                  { label: t("fields.operator.gt"), value: "gt" },
                  { label: t("fields.operator.gte"), value: "gte" },
                  { label: t("fields.operator.lt"), value: "lt" },
                  { label: t("fields.operator.lte"), value: "lte" },
                ]}
                required
              />
              <InputNumberField
                decimalScale={1}
                label={t("decision.resultValues.score")}
                max={scoreMaximum}
                min={1}
                name="thresholdConfig.value"
                required
                stepper={0.1}
              />
            </div>
          )}
        </section>
        <GlobalRouterSettings
          runtimeSupported={connectionIsAvailable && modelIsAvailable}
        />
        {submitError ? (
          <Alert variant="destructive">
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex justify-end gap-2 border-t pt-5">
          <Button onClick={onClose} type="button" variant="secondary">
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={creating || updating}
            onClick={submit}
            type="button"
          >
            {(creating || updating) && <Loader2Icon className="animate-spin" />}
            {t("actions.save")}
          </Button>
        </div>
      </form>
      <AlertDialog
        onOpenChange={(open) => !open && setPendingDecisionType(null)}
        open={pendingDecisionType !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("decision.discardTypeChangeTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {globalRouterEnabled
                ? `${t("decision.discardTypeChangeDescription")} ${t("decision.globalRouterRoutesDiscarded")}`
                : t("decision.discardTypeChangeDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDecisionType) {
                  applyDecisionType(pendingDecisionType)
                }
              }}
            >
              {t("actions.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Form>
  )
}
