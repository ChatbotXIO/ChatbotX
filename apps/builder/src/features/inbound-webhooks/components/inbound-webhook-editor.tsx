"use client"

import {
  INBOUND_WEBHOOK_LIMITS,
  inboundWebhookActionTypes,
} from "@chatbotx.io/database/partials"
import type { InboundWebhookModel } from "@chatbotx.io/database/types"
import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { isJsonbStorable } from "@chatbotx.io/utils/json-path"
import {
  BarChart3Icon,
  BracesIcon,
  CopyIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { type Path, useFieldArray, useForm } from "react-hook-form"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { parseJsonSafely } from "@/features/flows/react-flow/steps/external-request/components/json-path"
import { AddAction } from "@/features/triggers/add-action"
import { BaseEditor } from "@/features/triggers/base-editor"
import { ActionEditor } from "@/features/triggers/components/actions/editor"
import { updateInboundWebhookAction } from "../actions/update-inbound-webhook.action"
import { buildInboundWebhookUrl } from "../lib/endpoint-url"
import { translateInboundWebhookError } from "../lib/server-error"
import {
  type InboundWebhookFormValues,
  isWebhookActivatable,
  toConfigRequest,
  toFormValues,
} from "../lib/webhook-form"
import { inboundWebhookSampleJsonSchema } from "../schema/action"
import { ContactLookupSection } from "./contact-lookup-section"
import { FieldMappingsSection } from "./field-mappings-section"
import { InboundWebhookActiveSwitch } from "./inbound-webhook-active-switch"
import { InboxResolutionSection } from "./inbox-resolution-section"
import { RegenerateTokenDialog } from "./regenerate-token-dialog"
import { SecretUrlInput } from "./secret-url-input"

type SampleStatus = "idle" | "loaded" | "invalid" | "unsupported" | "tooLarge"

const prettySample = (value: unknown): string =>
  value === null || value === undefined ? "" : JSON.stringify(value, null, 2)

type InboundWebhookEditorProps = {
  workspaceId: string
  webhook: InboundWebhookModel
}

export const InboundWebhookEditor = ({
  workspaceId,
  webhook,
}: InboundWebhookEditorProps) => {
  const t = useTranslations()
  const router = useRouter()
  const [, copy] = useCopyToClipboard()

  const form = useForm<InboundWebhookFormValues>({
    defaultValues: toFormValues(webhook),
    mode: "onChange",
  })
  const { control } = form

  const {
    fields: actions,
    append: appendAction,
    remove: removeAction,
  } = useFieldArray({ control, name: "actions" })

  // The sample is not part of the form: it only feeds the pickers and previews
  // until it is saved with the rest of the config.
  const [sampleText, setSampleText] = useState(prettySample(webhook.sampleJson))
  const [sampleJson, setSampleJson] = useState<unknown>(
    webhook.sampleJson ?? undefined,
  )
  const [sampleStatus, setSampleStatus] = useState<SampleStatus>("idle")
  const [origin, setOrigin] = useState("")
  useEffect(() => setOrigin(window.location.origin), [])

  // A saved webhook can only be switched on when it is complete (the service enforces it too).
  const canActivate = isWebhookActivatable(webhook)

  const { execute, isPending } = useAction(
    updateInboundWebhookAction.bind(null, workspaceId, webhook.id),
    {
      onSuccess: () => {
        toast.success(
          t("messages.updatedSuccess", {
            feature: t("inboundWebhooks.feature"),
          }),
        )
        router.refresh()
      },
      onError: ({ error }) =>
        toast.error(
          translateInboundWebhookError(
            t,
            error.serverError,
            t("inboundWebhooks.feature"),
          ),
        ),
    },
  )

  /**
   * Parses the textarea into the working sample; `null` when it can't be used.
   * `format` also rewrites the textarea as indented JSON.
   */
  const loadSample = (options?: {
    format?: boolean
  }): { value: unknown } | null => {
    if (!sampleText.trim()) {
      setSampleJson(undefined)
      setSampleStatus("idle")
      return { value: undefined }
    }
    const parsed = parseJsonSafely(sampleText)
    if (!parsed.ok) {
      setSampleStatus("invalid")
      return null
    }
    if (!isJsonbStorable(parsed.value)) {
      setSampleStatus("unsupported")
      return null
    }
    if (!inboundWebhookSampleJsonSchema.safeParse(parsed.value).success) {
      setSampleStatus("tooLarge")
      return null
    }
    if (options?.format) {
      setSampleText(prettySample(parsed.value))
    }
    setSampleJson(parsed.value)
    setSampleStatus("loaded")
    return { value: parsed.value }
  }

  const submit = (values: InboundWebhookFormValues) => {
    // A sample edited but never loaded is loaded now, so Save never persists a stale one.
    const sample =
      sampleText === prettySample(sampleJson)
        ? { value: sampleJson }
        : loadSample()
    if (!sample) {
      toast.error(t("inboundWebhooks.save.invalid"))
      return
    }
    const result = toConfigRequest(values, { sampleJson: sample.value })
    if (!result.ok) {
      let focused = false
      for (const issue of result.issues) {
        if (issue.field) {
          form.setError(
            issue.field as Path<InboundWebhookFormValues>,
            {
              message: issue.messageKey
                ? t(`inboundWebhooks.issues.${issue.messageKey}`)
                : issue.message,
            },
            { shouldFocus: !focused },
          )
          focused = true
        }
      }
      // Some controls can't take focus and the field may be off-screen.
      toast.error(t("inboundWebhooks.save.invalid"))
      return
    }
    execute(result.data)
  }

  const endpointUrl = origin
    ? buildInboundWebhookUrl({ origin, token: webhook.token })
    : ""

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(submit)}
      >
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="font-bold text-xl">
                  {webhook.name}
                </CardTitle>
                <CardDescription>
                  {t("inboundWebhooks.editorDescription")}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  className={buttonVariants({ variant: "outline" })}
                  href={`/space/${workspaceId}/inbound-webhooks/${webhook.id}/analytics`}
                >
                  <BarChart3Icon aria-hidden className="size-4" />
                  {t("inboundWebhooks.viewAnalytics")}
                </Link>
                <Label htmlFor="inbound-webhook-active">
                  {t("inboundWebhooks.columns.active")}
                </Label>
                <InboundWebhookActiveSwitch
                  active={webhook.active}
                  disabled={!(webhook.active || canActivate)}
                  id={webhook.id}
                  name={webhook.name}
                  workspaceId={workspaceId}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Label htmlFor="inbound-webhook-url">
              {t("inboundWebhooks.endpoint.label")}
            </Label>
            <div className="flex flex-wrap gap-2">
              <SecretUrlInput id="inbound-webhook-url" value={endpointUrl} />
              <Button
                disabled={!endpointUrl}
                onClick={() =>
                  copy(endpointUrl).then(() =>
                    toast.success(t("messages.copiedToClipboard")),
                  )
                }
                type="button"
                variant="outline"
              >
                <CopyIcon aria-hidden className="size-4" />
                {t("actions.copy")}
              </Button>
              <RegenerateTokenDialog
                id={webhook.id}
                trigger={
                  <Button type="button" variant="outline">
                    <RefreshCwIcon aria-hidden className="size-4" />
                    {t("inboundWebhooks.regenerate.button")}
                  </Button>
                }
                workspaceId={workspaceId}
              />
            </div>
            {webhook.active || canActivate ? null : (
              <p className="text-muted-foreground text-xs">
                {t("inboundWebhooks.activation.incomplete")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("inboundWebhooks.sample.title")}</CardTitle>
            <CardDescription>
              {t("inboundWebhooks.sample.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Textarea
              aria-label={t("inboundWebhooks.sample.title")}
              className="min-h-40 font-mono text-xs"
              onChange={(event) => {
                setSampleText(event.target.value)
                setSampleStatus("idle")
              }}
              placeholder='{"customer": {"phone": "+84901234567"}}'
              value={sampleText}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => loadSample()}
                type="button"
                variant="outline"
              >
                {t("inboundWebhooks.sample.load")}
              </Button>
              <Button
                disabled={!sampleText.trim()}
                onClick={() => loadSample({ format: true })}
                type="button"
                variant="outline"
              >
                <BracesIcon aria-hidden className="size-4" />
                {t("inboundWebhooks.sample.format")}
              </Button>
              <p
                className={
                  sampleStatus === "loaded"
                    ? "text-sm text-success"
                    : "text-destructive text-sm"
                }
                role="status"
              >
                {sampleStatus === "idle"
                  ? null
                  : t(`inboundWebhooks.sample.status.${sampleStatus}`, {
                      max: INBOUND_WEBHOOK_LIMITS.maxSampleJsonBytes / 1024,
                    })}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("inboundWebhooks.contact.title")}</CardTitle>
            <CardDescription>
              {t("inboundWebhooks.contact.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <InboxResolutionSection sample={sampleJson} />
            <ContactLookupSection sample={sampleJson} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("inboundWebhooks.mappings.title")}</CardTitle>
            <CardDescription>
              {t("inboundWebhooks.mappings.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldMappingsSection sample={sampleJson} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("inboundWebhooks.actions.title")}</CardTitle>
            <CardDescription>
              {t("inboundWebhooks.actions.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {actions.map((action, index) => (
              <BaseEditor
                actionType={action.type}
                key={action.id}
                onRemove={() => removeAction(index)}
              >
                <ActionEditor
                  parentName={`actions.${index}`}
                  type={action.type}
                />
              </BaseEditor>
            ))}
            {actions.length < INBOUND_WEBHOOK_LIMITS.maxActions ? (
              <div>
                <AddAction
                  allowedTypes={inboundWebhookActionTypes.options}
                  onAdd={(option) =>
                    appendAction(
                      option.defaultFn() as InboundWebhookFormValues["actions"][number],
                    )
                  }
                />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="fixed inset-x-0 bottom-0 z-10 flex justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:start-auto">
          <Button
            onClick={() =>
              router.push(`/space/${workspaceId}/inbound-webhooks`)
            }
            type="button"
            variant="ghost"
          >
            {t("actions.cancel")}
          </Button>
          <Button disabled={isPending} type="submit">
            {isPending && <Loader2Icon aria-hidden className="animate-spin" />}
            {t("actions.save")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
