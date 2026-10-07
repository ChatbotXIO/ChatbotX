"use client"

import type { DecisionConnectionSafe } from "@chatbotx.io/business"
import type { DecisionProfileModel } from "@chatbotx.io/database/types"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { RadioGroupField } from "@chatbotx.io/ui/components/form/radio-group-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon, MinusIcon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useRef } from "react"
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

const defaults = (): DecisionProfileForm => ({
  connectionId: "",
  decision: {
    instructions: "",
    options: [
      { description: "", value: "option" },
      { description: "", value: "other" },
    ],
    type: "choice",
  },
  description: null,
  model: "",
  name: "",
  status: "enabled",
  thresholdConfig: null,
})

const fromProfile = (profile: DecisionProfileModel): DecisionProfileForm => {
  const question = decisionProfileStoredContractSchema.parse(profile.contract)
    .questions[0]
  if (!question) {
    return defaults()
  }
  const common = {
    connectionId: profile.connectionId,
    description: profile.description,
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
  const form = useForm<DecisionProfileForm>({
    defaultValues: profile
      ? fromProfile(profile)
      : {
          ...defaults(),
          connectionId: connections[0]?.id ?? "",
          model: connections[0]?.defaultModel ?? "",
        },
    mode: "onChange",
    resolver: zodResolver(decisionProfileFormSchema),
  })
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
  const isEditing = Boolean(profile)
  const previousDecisionType = useRef(decision.type)

  useEffect(() => {
    if (!selectedConnection) {
      return
    }
    const current = form.getValues("model")
    if (!selectedConnection.modelCatalog.includes(current)) {
      form.setValue(
        "model",
        selectedConnection.defaultModel ??
          (selectedConnection.modelCatalog.length === 1
            ? (selectedConnection.modelCatalog[0] ?? "")
            : ""),
      )
    }
  }, [form, selectedConnection])

  useEffect(() => {
    if (previousDecisionType.current === decision.type) {
      return
    }
    previousDecisionType.current = decision.type
    if (decision.type === "choice") {
      form.setValue("decision", {
        instructions: "",
        options: [
          { description: "", value: "option" },
          { description: "", value: "other" },
        ],
        type: "choice",
      })
    } else if (decision.type === "score") {
      form.setValue("decision", {
        instructions: "",
        levels: Array.from({ length: 5 }, () => ({ description: "" })),
        type: "score",
      })
    } else {
      form.setValue("decision", {
        falseCriteria: "",
        instructions: "",
        trueCriteria: "",
        type: "noul",
      })
    }
    form.setValue("thresholdConfig", null)
  }, [decision.type, form])

  const success = () => {
    toast.success(
      t(isEditing ? "messages.updatedSuccess" : "messages.createdSuccess", {
        feature: t("decision.profile"),
      }),
    )
    invalidateDecisionProfiles()
    onClose()
    router.refresh()
  }
  const error = ({ error }: { error: { serverError?: string } }) =>
    error.serverError && toast.error(error.serverError)
  const { execute: create, isPending: creating } = useAction(
    createDecisionProfileAction.bind(null, workspaceId),
    { onError: error, onSuccess: success },
  )
  const { execute: update, isPending: updating } = useAction(
    updateDecisionProfileAction.bind(null, workspaceId),
    { onError: error, onSuccess: success },
  )

  return (
    <Form {...form}>
      <form
        className="space-y-6"
        onSubmit={form.handleSubmit((value) =>
          profile ? update({ ...value, id: profile.id }) : create(value),
        )}
      >
        <section className="space-y-4">
          <h3 className="font-semibold">{t("decision.profiles")}</h3>
          <InputField label={t("fields.name.label")} name="name" required />
          <TextareaField
            label={t("fields.description.label")}
            name="description"
            rows={2}
          />
          <SelectField
            label={t("decision.connection")}
            name="connectionId"
            options={connections.map((connection) => ({
              disabled:
                connection.status !== "enabled" &&
                connection.id !== profile?.connectionId,
              label: connection.name,
              value: connection.id,
            }))}
            required
          />
          <SelectField
            label={t("decision.model")}
            name="model"
            options={(selectedConnection?.modelCatalog ?? []).map((model) => ({
              label: model,
              value: model,
            }))}
            required
          />
          <RadioGroupField
            label={t("decision.status.label")}
            name="status"
            options={[
              { label: t("decision.status.enabled"), value: "enabled" },
              { label: t("decision.status.disabled"), value: "disabled" },
            ]}
            orientation="horizontal"
          />
        </section>
        <section className="space-y-4 border-t pt-5">
          <h3 className="font-semibold">{t("decision.question")}</h3>
          <RadioGroupField
            name="decision.type"
            options={[
              { label: t("decision.resultValues.choice"), value: "choice" },
              { label: t("decision.resultValues.score"), value: "score" },
              { label: t("decision.resultValues.noul"), value: "noul" },
            ]}
            orientation="horizontal"
          />
          <TextareaField
            label={t("decision.question")}
            name="decision.instructions"
            required
            rows={3}
          />
        </section>
        <section className="space-y-3 border-t pt-5">
          <h3 className="font-semibold">{t("decision.result")}</h3>
          {decision.type === "choice" &&
            choiceFields.fields.map((field, index) => (
              <div className="flex items-end gap-2" key={field.id}>
                <InputField
                  label={t("decision.resultValues.choice")}
                  name={`decision.options.${index}.value` as never}
                />
                <TextareaField
                  label={t("fields.description.label")}
                  name={`decision.options.${index}.description` as never}
                  rows={1}
                />
                <Button
                  aria-label={t("actions.delete")}
                  disabled={choiceFields.fields.length <= 2}
                  onClick={() => choiceFields.remove(index)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <MinusIcon />
                </Button>
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
              <div className="flex items-end gap-2" key={field.id}>
                <Label className="mb-2 w-8">{index + 1}</Label>
                <TextareaField
                  label={t("fields.description.label")}
                  name={`decision.levels.${index}.description` as never}
                  rows={1}
                />
                <Button
                  aria-label={t("actions.delete")}
                  disabled={scoreFields.fields.length <= 2}
                  onClick={() => scoreFields.remove(index)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <MinusIcon />
                </Button>
              </div>
            ))}
          {decision.type === "score" && (
            <Button
              disabled={scoreFields.fields.length >= 10}
              onClick={() => scoreFields.append({ description: "" } as never)}
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
                label={t("decision.resultValues.noul")}
                name="decision.trueCriteria"
                required
                rows={2}
              />
              <TextareaField
                label={t("decision.resultValues.noul")}
                name="decision.falseCriteria"
                required
                rows={2}
              />
            </>
          )}
        </section>
        <section className="space-y-2 border-t pt-5">
          <h3 className="font-semibold">{t("decision.currentMessageOnly")}</h3>
          <p className="text-muted-foreground text-sm">
            {t("decision.currentMessageOnly")}
          </p>
        </section>
        <section className="space-y-2 border-t pt-5">
          <h3 className="font-semibold">{t("decision.status.label")}</h3>
          <div className="flex items-center gap-2">
            <Switch
              checked={Boolean(form.watch("thresholdConfig"))}
              onCheckedChange={(enabled) => {
                if (!enabled) {
                  form.setValue("thresholdConfig", null)
                } else if (decision.type === "score") {
                  form.setValue("thresholdConfig", {
                    operator: "gte",
                    type: "score",
                    value: 3,
                  })
                } else if (decision.type === "noul") {
                  form.setValue("thresholdConfig", {
                    minimum: 0.7,
                    type: "noul_true_probability",
                  })
                } else {
                  form.setValue("thresholdConfig", {
                    minimum: 0.8,
                    type: "choice_confidence",
                  })
                }
              }}
            />
            <span className="text-sm">{t("decision.result")}</span>
          </div>
          {form.watch("thresholdConfig")?.type === "choice_confidence" && (
            <InputNumberField
              max={1}
              min={0}
              name="thresholdConfig.minimum"
              step={0.01}
            />
          )}
          {form.watch("thresholdConfig")?.type === "noul_true_probability" && (
            <InputNumberField
              max={1}
              min={0}
              name="thresholdConfig.minimum"
              step={0.01}
            />
          )}
          {form.watch("thresholdConfig")?.type === "score" && (
            <InputNumberField
              max={decision.type === "score" ? decision.levels.length : 10}
              min={1}
              name="thresholdConfig.value"
              step={0.1}
            />
          )}
        </section>
        <section className="rounded-md border bg-muted/30 p-3 text-muted-foreground text-sm">
          {t("decision.profileDescription")}
        </section>
        <div className="flex justify-end gap-2 border-t pt-5">
          <Button onClick={onClose} type="button" variant="secondary">
            {t("actions.cancel")}
          </Button>
          <Button disabled={creating || updating} type="submit">
            {(creating || updating) && <Loader2Icon className="animate-spin" />}
            {t("actions.save")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
