"use client"

import { FormOptionalLabelProvider } from "@chatbotx.io/ui/components/form/optional-label-context"
import {
  CONTACT_LOOKUP_ORDER,
  type ContactIdentityKind,
  GENERIC_CHANNEL_USER_ID_EXAMPLE_PATH,
  INBOUND_WEBHOOK_CHANNEL_SPECS,
  missingCreationIdentityKinds,
} from "@chatbotx.io/utils/inbound-webhook-channel"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { useInboxList } from "@/features/inboxes/provider/inbox-hook"
import {
  buildInboxChannelMap,
  IDENTITY_PATH_FIELD,
  type InboundWebhookFormValues,
  resolveFormChannel,
} from "../lib/webhook-form"
import { JsonPathField } from "./json-path-field"

const IDENTITY_EXAMPLE_PATH: Record<
  Exclude<ContactIdentityKind, "channelUserId">,
  string
> = {
  phone: "$.customer.phone",
  email: "$.customer.email",
  fullName: "$.customer.name",
}

/**
 * The four ways a request can name the contact, always shown in the order they
 * are searched (channel user id, phone, email, full name). At least one is
 * required; the first one the request carries is the one the contact is looked
 * up by. Only the channel user id's label and example depend on the channel,
 * both read from the shared channel registry.
 */
export const ContactLookupSection = ({ sample }: { sample: unknown }) => {
  const t = useTranslations("inboundWebhooks")
  const { control } = useFormContext<InboundWebhookFormValues>()
  const mode = useWatch({ control, name: "inboxMode" })
  const inboxId = useWatch({ control, name: "inboxId" })
  const payloadChannel = useWatch({ control, name: "payloadChannel" })
  const inboxes = useInboxList()
  const inboxChannelById = useMemo(
    () => buildInboxChannelMap(inboxes),
    [inboxes],
  )

  const channel = resolveFormChannel(
    { inboxMode: mode, inboxId, payloadChannel },
    inboxChannelById,
  )
  const channelUserId = channel
    ? INBOUND_WEBHOOK_CHANNEL_SPECS[channel].channelUserId
    : null
  const paths = useWatch({
    control,
    name: CONTACT_LOOKUP_ORDER.map((kind) => IDENTITY_PATH_FIELD[kind]),
  })
  const configuredKinds = CONTACT_LOOKUP_ORDER.filter((_, index) =>
    String(paths[index] ?? "").trim(),
  )
  const labelOf = (kind: ContactIdentityKind): string =>
    kind === "channelUserId" && channelUserId
      ? t(`channelUserIdKinds.${channelUserId.kind}`)
      : t(`identity.${kind}`)
  // Not an error: a webhook that only updates existing contacts is valid, but
  // without one of these a request for an unknown contact is skipped.
  const missingKinds =
    channel && configuredKinds.length > 0
      ? missingCreationIdentityKinds(channel, configuredKinds)
      : []
  const exampleOf = (kind: ContactIdentityKind): string =>
    kind === "channelUserId"
      ? (channelUserId?.examplePath ?? GENERIC_CHANNEL_USER_ID_EXAMPLE_PATH)
      : IDENTITY_EXAMPLE_PATH[kind]

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <p className="text-muted-foreground text-xs">{t("identity.hint")}</p>
      {/* "At least one of four", so none of them is "(optional)". */}
      <FormOptionalLabelProvider value="">
        {CONTACT_LOOKUP_ORDER.map((kind) => (
          <JsonPathField
            key={kind}
            label={labelOf(kind)}
            name={IDENTITY_PATH_FIELD[kind]}
            placeholder={exampleOf(kind)}
            sample={sample}
          />
        ))}
      </FormOptionalLabelProvider>
      {missingKinds.length > 0 ? (
        <p className="text-muted-foreground text-xs" role="status">
          {t("identity.creationHint", {
            identities: missingKinds.map(labelOf).join(" / "),
          })}
        </p>
      ) : null}
    </div>
  )
}
