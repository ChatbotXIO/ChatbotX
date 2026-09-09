import type { InboxWithIntegrations } from "@chatbotx.io/database/types"
import type { ContactScanChannel } from "@chatbotx.io/utils/channel"

export type ContactScanIntegrationRef = { integrationId: string }

/**
 * The ONLY place in `packages/business` that names a contact-scan channel.
 * `satisfies Record<ContactScanChannel, …>` makes adding a value to
 * `contactScanChannels` (`@chatbotx.io/utils/channel`) without adding its
 * lookup here a compile error, instead of an `if (channel === "messenger")`
 * that silently does nothing for the new channel.
 *
 * Each lookup returns `null` when the inbox has no matching integration
 * relation loaded (e.g. `InboxService.withIntegrations` did not include it,
 * or the relation genuinely does not exist) — callers treat `null` the same
 * as "channel not actually connected".
 */
export const contactScanIntegrationRefs = {
  messenger: (
    inbox: InboxWithIntegrations,
  ): ContactScanIntegrationRef | null =>
    inbox.integrationMessenger
      ? { integrationId: inbox.integrationMessenger.id }
      : null,
  // Both Instagram account types (native login and Facebook-linked) share the
  // same `integrationInstagram` relation on the inbox; which underlying
  // conversation API to call is resolved later, in the worker adapter, from
  // the integration row's own `type` column.
  instagram: (
    inbox: InboxWithIntegrations,
  ): ContactScanIntegrationRef | null =>
    inbox.integrationInstagram
      ? { integrationId: inbox.integrationInstagram.id }
      : null,
} satisfies Record<
  ContactScanChannel,
  (inbox: InboxWithIntegrations) => ContactScanIntegrationRef | null
>
