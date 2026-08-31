import {
  buildContext,
  type ContactProfileFetcher,
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
import { integrations } from "@/integration"

export type ProfileFetcherFactoryInput = {
  workspaceId: string
  inboxId: string
  sourceId: string
}
export type ProfileFetcherFactory = (
  input: ProfileFetcherFactoryInput,
) => ContactProfileFetcher

/**
 * One lazy `ContactProfileFetcher` factory per on-demand-capable channel,
 * exhaustive over `OnDemandProfileChannel`. Each entry does ALL channel
 * resolution (integration row, `buildContext`, registry lookup, Graph call)
 * inside the returned callback — a missing/disconnected integration
 * (`findByInboxIdForWorkspace` throws) surfaces inside
 * `contactProfileRefreshService.refresh` as `failed` + cooldown instead of an
 * action rejection. Every entry is written against its own literal registry
 * key so `runChannelHandler` stays typed per channel (no union widening).
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
      const ctx = await buildContext({
        workspaceId,
        integrationType: "messenger",
        integration: { ...row, auth: row.auth as MessengerAuthValue },
      })
      return integrations.messenger.runChannelHandler("contact", "getProfile", {
        ctx,
        data: { sourceId },
      })
    },
  instagram:
    ({ workspaceId, inboxId, sourceId }) =>
    async () => {
      const row = await instagramIntegrationService.findByInboxIdForWorkspace({
        inboxId,
        workspaceId,
      })
      const ctx = await buildContext({
        workspaceId,
        integrationType: "instagram",
        integration: { ...row, auth: row.auth as InstagramAuthValue },
      })
      // Mirrors apps/worker/src/services/integrations.ts (isInstagramViaFacebook).
      const registry =
        row.type === "facebook"
          ? integrations.instagramFacebook
          : integrations.instagram
      return registry.runChannelHandler("contact", "getProfile", {
        ctx,
        data: { sourceId },
      })
    },
  zalo:
    ({ workspaceId, inboxId, sourceId }) =>
    async () => {
      const row = await zaloIntegrationService.findByInboxIdForWorkspace({
        inboxId,
        workspaceId,
      })
      const ctx = await buildContext({
        workspaceId,
        integrationType: "zalo",
        integration: { ...row, auth: row.auth as ZaloAuthValue },
      })
      return integrations.zalo.runChannelHandler("contact", "getProfile", {
        ctx,
        data: { sourceId },
      })
    },
  telegram:
    ({ workspaceId, inboxId, sourceId }) =>
    async () => {
      const row = await telegramIntegrationService.findByInboxIdForWorkspace({
        inboxId,
        workspaceId,
      })
      const ctx = await buildContext({
        workspaceId,
        integrationType: "telegram",
        integration: { ...row, auth: row.auth as TelegramAuthValue },
      })
      return integrations.telegram.runChannelHandler("contact", "getProfile", {
        ctx,
        data: { sourceId },
      })
    },
}
