import {
  inboxService,
  instagramIntegrationService,
} from "@chatbotx.io/business"
import type {
  InboxModel,
  IntegrationInstagramModel,
} from "@chatbotx.io/database/types"
import { mapToChannelError as mapInstagramError } from "@chatbotx.io/integration-instagram"
import { listInstagramConversations } from "@chatbotx.io/integration-instagram/apis/sync"
import { mapToChannelError as mapInstagramFacebookError } from "@chatbotx.io/integration-instagram-facebook"
import { listInstagramFacebookConversations } from "@chatbotx.io/integration-instagram-facebook/apis/sync"
import { z } from "zod"
import {
  findCustomerParticipant,
  parseInstagramApiDate,
  toIncomingContact,
} from "../../coexist/instagram-normalize"
import type { ContactScanAdapter, ContactScanPage } from "../adapter"
import { classifyChannelErrorForScan } from "../graph-error"
import { peakUsagePercent, readBackoffFromErrorResponse } from "../usage-signal"

type InstagramIntegrationType = IntegrationInstagramModel["type"]

/**
 * `IntegrationInstagram.auth` jsonb shape the contact-scan adapter needs —
 * same shape as `messenger-helpers.ts`'s `messengerAuthSchema`. `igId` and
 * `pageId` are read from the integration row's own columns (both `notNull`
 * for every Instagram integration, native or Facebook-linked — see
 * `packages/database/src/schema/integration-instagram.ts`), not re-parsed out
 * of `auth.metadata` the way the coexist adapters do, so this schema only
 * needs the token/version.
 */
const instagramContactScanAuthSchema = z
  .object({
    tokens: z.object({ accessToken: z.string() }).passthrough(),
    metadata: z
      .object({ version: z.string().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough()

type NativeInstagramContactScanContext = {
  providerType: "instagram"
  inbox: InboxModel
  accessToken: string
  version: string | undefined
  igId: string
}

type FacebookInstagramContactScanContext = {
  providerType: "facebook"
  inbox: InboxModel
  accessToken: string
  version: string | undefined
  igId: string
  pageId: string
}

export type InstagramContactScanContext =
  | NativeInstagramContactScanContext
  | FacebookInstagramContactScanContext

type SharedContextFields = {
  inbox: InboxModel
  accessToken: string
  version: string | undefined
  igId: string
}

/**
 * Builds the type-specific context variant from the shared, already-resolved
 * fields — a table so a third Instagram account type is a compile error here
 * instead of an `if (type === "instagram") … else …` in `loadContext`.
 */
const buildContextByProviderType: Record<
  InstagramIntegrationType,
  (
    shared: SharedContextFields,
    integration: IntegrationInstagramModel,
  ) => InstagramContactScanContext
> = {
  instagram: (shared) => ({ ...shared, providerType: "instagram" }),
  facebook: (shared, integration) => ({
    ...shared,
    providerType: "facebook",
    pageId: integration.pageId,
  }),
}

/**
 * Lists one page of conversations from the correct underlying Graph API —
 * native Instagram Login reads from the IG user node
 * (`@chatbotx.io/integration-instagram`), Facebook-linked Instagram reads from
 * the Page node with `?platform=instagram`
 * (`@chatbotx.io/integration-instagram-facebook`) — mirroring the dispatch
 * `instagram-sync.ts`'s `instagramCoexistProvidersByType` does for coexist.
 * Takes the already-narrowed flat fields (not the union `context` object) so
 * no per-branch type narrowing/casting is needed.
 */
const listConversationsByProviderType: Record<
  InstagramIntegrationType,
  (input: {
    igId: string
    pageId: string | undefined
    accessToken: string
    version: string | undefined
    cursor: string | undefined
  }) => ReturnType<typeof listInstagramConversations>
> = {
  instagram: ({ igId, accessToken, version, cursor }) =>
    listInstagramConversations({
      igUserId: igId,
      accessToken,
      version,
      after: cursor,
    }),
  facebook: ({ pageId, accessToken, version, cursor }) => {
    if (!pageId) {
      return Promise.reject(
        new Error(
          "Instagram (Facebook) contact scan context is missing pageId",
        ),
      )
    }
    return listInstagramFacebookConversations({
      pageId,
      accessToken,
      version,
      after: cursor,
    })
  },
}

/**
 * Each Instagram provider has its own error mapper (the two packages carry
 * different rate-limit code tables), picked by the integration type.
 */
const mapErrorByProviderType: Record<
  InstagramIntegrationType,
  typeof mapInstagramError
> = {
  instagram: mapInstagramError,
  facebook: mapInstagramFacebookError,
}

export const instagramContactScanAdapter: ContactScanAdapter<InstagramContactScanContext> =
  {
    channel: "instagram",
    provider: "instagram",

    async loadContext({ workspaceId, integrationId }) {
      const integration =
        await instagramIntegrationService.findByIdForWorkspace({
          id: integrationId,
          workspaceId,
        })
      if (!integration) {
        return null
      }

      const parsedAuth = instagramContactScanAuthSchema.safeParse(
        integration.auth,
      )
      if (!parsedAuth.success) {
        return null
      }

      const inbox = await inboxService.find({
        where: { id: integration.inboxId, workspaceId },
      })
      if (!inbox) {
        return null
      }

      const shared: SharedContextFields = {
        inbox,
        accessToken: parsedAuth.data.tokens.accessToken,
        version: parsedAuth.data.metadata?.version,
        igId: integration.igId,
      }

      return buildContextByProviderType[integration.type](shared, integration)
    },

    async listPage({ context, cursor }): Promise<ContactScanPage> {
      // No inline retry: a transient failure or a rate limit is handed back to
      // the engine, which waits through the queue instead of sleeping here.
      const page = await listConversationsByProviderType[context.providerType]({
        igId: context.igId,
        pageId:
          context.providerType === "facebook" ? context.pageId : undefined,
        accessToken: context.accessToken,
        version: context.version,
        cursor,
      })

      const entries: ContactScanPage["entries"] = []
      for (const conversation of page.data) {
        const participant = findCustomerParticipant({
          participants: conversation.participants?.data ?? [],
          messages: [],
          igId: context.igId,
        })
        if (!participant) {
          continue
        }
        entries.push({
          contact: toIncomingContact(participant),
          updatedAt: parseInstagramApiDate(conversation.updated_time) ?? null,
        })
      }

      return {
        entries,
        after: page.after,
        usageSignal: page.appUsage
          ? {
              usagePercent: peakUsagePercent({
                callCount: page.appUsage.call_count,
                totalCputime: page.appUsage.total_cputime,
                totalTime: page.appUsage.total_time,
              }),
            }
          : null,
      }
    },

    classifyError: ({ error, context }) =>
      classifyChannelErrorForScan({
        error,
        mapToChannelError: mapErrorByProviderType[context.providerType],
      }),

    readBackoff: ({ error }) => readBackoffFromErrorResponse(error),
  }
