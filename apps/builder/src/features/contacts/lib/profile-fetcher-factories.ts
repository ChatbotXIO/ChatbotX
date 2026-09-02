import {
  type BuildContextIntegrationRow,
  buildContext,
  type ContactProfileFetcher,
  type IntegrationContext,
  instagramIntegrationService,
  messengerIntegrationService,
  type OnDemandProfileChannel,
  telegramIntegrationService,
  zaloIntegrationService,
} from "@chatbotx.io/business"
import type { InstagramAuthValue } from "@chatbotx.io/integration-instagram/schemas"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger/schema"
import type { TelegramAuthValue } from "@chatbotx.io/integration-telegram"
import type { ZaloAuthValue } from "@chatbotx.io/integration-zalo/schema"
import type { AuthValue } from "@chatbotx.io/sdk"
import { integrations } from "@/integration"

export type ProfileFetcherFactoryInput = {
  workspaceId: string
  inboxId: string
  sourceId: string
}
export type ProfileFetcherFactory = (
  input: ProfileFetcherFactoryInput,
) => ContactProfileFetcher

type ChannelProfileRunner<TAuth extends AuthValue> = (
  group: "contact",
  name: "getProfile",
  props: { ctx: IntegrationContext<TAuth>; data: { sourceId: string } },
) => ReturnType<ContactProfileFetcher>

/**
 * Shared core behind every `profileFetcherFactories` entry: `buildContext`
 * from the already-fetched integration row, then dispatch
 * `contact.getProfile` through the caller's (already-bound)
 * `runChannelHandler`. Per-channel closures below keep their own literal
 * `integrationType`, auth cast, and registry lookup (instagram's
 * facebook-vs-direct split) so `runChannelHandler` stays typed per channel.
 */
const fetchChannelProfile = async <TAuth extends AuthValue>({
  workspaceId,
  sourceId,
  integrationType,
  row,
  runChannelHandler,
}: {
  workspaceId: string
  sourceId: string
  integrationType: OnDemandProfileChannel
  row: BuildContextIntegrationRow<TAuth>
  runChannelHandler: ChannelProfileRunner<TAuth>
}): ReturnType<ContactProfileFetcher> => {
  const ctx = await buildContext<TAuth>({
    workspaceId,
    integrationType,
    integration: row,
  })
  return runChannelHandler("contact", "getProfile", {
    ctx,
    data: { sourceId },
  })
}

/**
 * One lazy `ContactProfileFetcher` factory per on-demand-capable channel,
 * exhaustive over `OnDemandProfileChannel`. Each entry does ALL channel
 * resolution (integration row, `buildContext`, registry lookup, Graph call)
 * inside the returned callback — a missing/disconnected integration
 * (`findByInboxIdForWorkspace` throws) surfaces inside
 * `contactProfileRefreshService.refresh` as `failed` + cooldown instead of an
 * action rejection.
 */
export const profileFetcherFactories: Record<
  OnDemandProfileChannel,
  ProfileFetcherFactory
> = {
  messenger:
    ({ workspaceId, inboxId, sourceId }) =>
    async () => {
      const row = await messengerIntegrationService.findByInboxIdForWorkspace({
        inboxId,
        workspaceId,
      })
      return fetchChannelProfile<MessengerAuthValue>({
        workspaceId,
        sourceId,
        integrationType: "messenger",
        row: { ...row, auth: row.auth as MessengerAuthValue },
        runChannelHandler: (group, name, props) =>
          integrations.messenger.runChannelHandler(group, name, props),
      })
    },
  instagram:
    ({ workspaceId, inboxId, sourceId }) =>
    async () => {
      const row = await instagramIntegrationService.findByInboxIdForWorkspace({
        inboxId,
        workspaceId,
      })
      // Mirrors apps/worker/src/services/integrations.ts (isInstagramViaFacebook).
      const registry =
        row.type === "facebook"
          ? integrations.instagramFacebook
          : integrations.instagram
      return fetchChannelProfile<InstagramAuthValue>({
        workspaceId,
        sourceId,
        integrationType: "instagram",
        row: { ...row, auth: row.auth as InstagramAuthValue },
        runChannelHandler: (group, name, props) =>
          registry.runChannelHandler(group, name, props),
      })
    },
  zalo:
    ({ workspaceId, inboxId, sourceId }) =>
    async () => {
      const row = await zaloIntegrationService.findByInboxIdForWorkspace({
        inboxId,
        workspaceId,
      })
      return fetchChannelProfile<ZaloAuthValue>({
        workspaceId,
        sourceId,
        integrationType: "zalo",
        row: { ...row, auth: row.auth as ZaloAuthValue },
        runChannelHandler: (group, name, props) =>
          integrations.zalo.runChannelHandler(group, name, props),
      })
    },
  telegram:
    ({ workspaceId, inboxId, sourceId }) =>
    async () => {
      const row = await telegramIntegrationService.findByInboxIdForWorkspace({
        inboxId,
        workspaceId,
      })
      return fetchChannelProfile<TelegramAuthValue>({
        workspaceId,
        sourceId,
        integrationType: "telegram",
        row: { ...row, auth: row.auth as TelegramAuthValue },
        runChannelHandler: (group, name, props) =>
          integrations.telegram.runChannelHandler(group, name, props),
      })
    },
}
