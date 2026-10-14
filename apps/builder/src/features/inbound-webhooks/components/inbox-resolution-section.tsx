"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import {
  SelectField,
  type SelectOption,
} from "@chatbotx.io/ui/components/form/select-field"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  RadioGroup,
  RadioGroupItem,
} from "@chatbotx.io/ui/components/ui/radio-group"
import {
  INBOUND_WEBHOOK_CHANNEL_SPECS,
  PAYLOAD_RESOLVABLE_CHANNELS,
} from "@chatbotx.io/utils/inbound-webhook-channel"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { type PathValue, useFormContext, useWatch } from "react-hook-form"
import { useInboxList } from "@/features/inboxes/provider/inbox-hook"
import {
  type FormPatch,
  type InboundWebhookFormValues,
  type InboxMode,
  isSavedInboxUnavailable,
  parseChannel,
  parseInboxIdentifierKind,
  patchForIdentifierKind,
  patchForInboxMode,
  patchForPayloadChannel,
} from "../lib/webhook-form"
import { JsonPathField } from "./json-path-field"

const INBOX_MODES: InboxMode[] = ["inbox", "payload"]

/** The fields an inbox-rule change (`patchFor*`) can rewrite. */
type PatchedField =
  | "inboxMode"
  | "inboxId"
  | "payloadChannel"
  | "identifierKind"
  | "inboxJsonPath"

/**
 * "Which inbox does this contact belong to": one fixed inbox, or the channel's
 * own inbox id read from the payload. Everything shown is derived from the
 * shared channel registry, so a new channel needs no change here.
 */
export const InboxResolutionSection = ({ sample }: { sample: unknown }) => {
  const t = useTranslations("inboundWebhooks")
  const tFields = useTranslations("fields")
  const { control, setValue } = useFormContext<InboundWebhookFormValues>()
  const [watchedMode, inboxId, payloadChannel, identifierKind] = useWatch({
    control,
    name: ["inboxMode", "inboxId", "payloadChannel", "identifierKind"],
  })
  const inboxes = useInboxList()

  const connectedInboxes = useMemo(
    () => inboxes.filter((inbox) => inbox.status === "connected"),
    [inboxes],
  )
  const inboxOptions = useMemo<SelectOption[]>(
    () =>
      connectedInboxes.map((inbox) => ({
        value: inbox.id,
        label: `${inbox.name} · ${tFields(`${inbox.channel}.label`)}`,
      })),
    [connectedInboxes, tFields],
  )
  const channelOptions = useMemo<SelectOption[]>(
    () =>
      PAYLOAD_RESOLVABLE_CHANNELS.filter((channel) =>
        connectedInboxes.some((inbox) => inbox.channel === channel),
      ).map((channel) => ({
        value: channel,
        label: tFields(`${channel}.label`),
      })),
    [connectedInboxes, tFields],
  )

  const mode = watchedMode ?? "inbox"
  const identifierKinds =
    mode === "payload" && payloadChannel
      ? INBOUND_WEBHOOK_CHANNEL_SPECS[payloadChannel].inboxIdentifiers
      : []
  const selectedIdentifier = identifierKinds.find(
    ({ kind }) => kind === identifierKind,
  )
  const connectedInboxIds = useMemo(
    () => new Set(connectedInboxes.map((inbox) => inbox.id)),
    [connectedInboxes],
  )
  const savedInboxMissing = isSavedInboxUnavailable(
    { inboxMode: mode, inboxId: inboxId ?? "" },
    connectedInboxIds,
  )

  const setPatchedValue = <K extends PatchedField>(
    name: K,
    value: PathValue<InboundWebhookFormValues, K> | undefined,
  ) => {
    if (value !== undefined) {
      setValue(name, value, { shouldDirty: true, shouldValidate: true })
    }
  }
  const applyPatch = (patch: FormPatch) => {
    setPatchedValue("inboxMode", patch.inboxMode)
    setPatchedValue("inboxId", patch.inboxId)
    setPatchedValue("payloadChannel", patch.payloadChannel)
    setPatchedValue("identifierKind", patch.identifierKind)
    setPatchedValue("inboxJsonPath", patch.inboxJsonPath)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <RadioGroup
          aria-label={t("inbox.modeLabel")}
          className="flex flex-row flex-wrap gap-4"
          onValueChange={(next) =>
            applyPatch(patchForInboxMode(next as InboxMode))
          }
          value={mode}
        >
          {INBOX_MODES.map((option) => (
            <div className="flex items-center gap-2" key={option}>
              <RadioGroupItem id={`inbox-mode-${option}`} value={option} />
              <Label className="font-normal" htmlFor={`inbox-mode-${option}`}>
                {t(`inbox.mode.${option}`)}
              </Label>
            </div>
          ))}
        </RadioGroup>
        <p className="text-muted-foreground text-xs">
          {t(`inbox.modeDescription.${mode}`)}
        </p>
      </div>

      {mode === "inbox" ? (
        <>
          <ComboboxField
            emptyText={t("inbox.noInboxes")}
            label={t("inbox.inboxLabel")}
            name="inboxId"
            options={inboxOptions}
            placeholder={t("inbox.inboxPlaceholder")}
            required
          />
          {savedInboxMissing ? (
            <p className="text-destructive text-xs" role="alert">
              {t("inbox.savedInboxMissing")}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <SelectField
            label={t("inbox.channelLabel")}
            name="payloadChannel"
            options={channelOptions}
            placeholder={t("inbox.channelPlaceholder")}
            required
            triggerValueChange={(next) => {
              const selected = parseChannel(next ?? "")
              if (selected) {
                applyPatch(patchForPayloadChannel(selected))
              }
            }}
          />
          {channelOptions.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              {t("inbox.noPayloadChannels")}
            </p>
          ) : null}
          {identifierKinds.length > 1 ? (
            <SelectField
              label={t("inbox.identifierKindLabel")}
              name="identifierKind"
              options={identifierKinds.map(({ kind }) => ({
                value: kind,
                label: t(`inboxIdentifierKinds.${kind}`),
              }))}
              placeholder={t("inbox.identifierKindPlaceholder")}
              required
              triggerValueChange={(next) => {
                const selected = parseInboxIdentifierKind(next ?? "")
                if (selected) {
                  applyPatch(patchForIdentifierKind(selected))
                }
              }}
            />
          ) : null}
          {identifierKind ? (
            <JsonPathField
              description={t("inbox.identifierPathHint")}
              label={t(`inboxIdentifierKinds.${identifierKind}`)}
              name="inboxJsonPath"
              placeholder={selectedIdentifier?.examplePath}
              required
              sample={sample}
            />
          ) : null}
        </>
      )}
    </div>
  )
}
