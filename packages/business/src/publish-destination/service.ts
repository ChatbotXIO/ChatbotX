import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type { SocialProvider } from "@chatbotx.io/database/partials"
import {
  type InboxPublishProvider,
  MAX_PUBLISH_INBOXES_PER_PROVIDER,
  type PublishDestinationStateRow,
  publishDestinationRepository,
  publishDestinationStateRepository,
} from "@chatbotx.io/database/repositories"
import {
  missingPublishScopes,
  type PublishDestinationState,
} from "@chatbotx.io/utils/publish-destination"
import type { PublisherKey } from "@chatbotx.io/utils/social-publisher"
import { BaseService } from "../base.service"
import { notFoundException, validationException } from "../errors"
import { resolveTenantSettings } from "../platform/settings"
import {
  AVATAR_CONNECT_ENQUEUE_DELAY_MS,
  isAvatarStale,
  publishDestinationAvatarService,
} from "./avatar"
import { buildDestinationAvatarUrls } from "./avatar-url"
import { type PublishDestinationDto, toPublishDestinationDto } from "./dto"

/** A caller names a destination either by its binding id or by the inbox that publishes. */
export type PublishDestinationRef = {
  destinationId?: string | null
  inboxId?: string | null
}

export type ListPublishDestinationsInput = {
  /** Skip destinations whose inbox is disconnected (what pickers show). */
  connectedOnly?: boolean
  providers?: readonly SocialProvider[]
  states?: readonly PublishDestinationState[]
  workspaceId: string
}

export type PublishDestinationList = {
  destinations: PublishDestinationDto[]
  truncated: boolean
}

const INBOX_PROVIDERS: readonly InboxPublishProvider[] = [
  "facebook",
  "instagram",
  "threads",
]

/**
 * An inbox destination with no stored picture whose last fetch is missing or
 * stale is served through the on-view route; a recorded "no picture" or a
 * recent failure, and a destination that cannot be fetched, are not.
 */
const needsAvatarProxy = (row: PublishDestinationStateRow): boolean =>
  row.inboxId !== null &&
  !row.avatar &&
  row.state !== "inboxDisconnected" &&
  row.state !== "needsReconnect" &&
  isAvatarStale(row.avatarFetchedAt)

class PublishDestinationService extends BaseService {
  /**
   * The binding id of each inbox, creating the bindings that are missing
   * (idempotent, workspace-checked). An inbox that cannot publish or belongs to
   * another workspace is absent from the map.
   */
  async resolveInboxDestinations(
    input: { inboxIds: readonly string[]; workspaceId: string },
    tx = db,
  ): Promise<Map<string, string>> {
    const bindings = await publishDestinationRepository.ensureForInboxes(
      input,
      tx,
    )
    return new Map(bindings.map((binding) => [binding.inboxId, binding.id]))
  }

  /**
   * Turns each ref into a binding id: exactly one of `destinationId` or
   * `inboxId` per ref. Throws a validation error naming the ref when it has
   * both or neither, or its inbox cannot publish.
   */
  async resolveRefs(
    input: {
      refs: readonly PublishDestinationRef[]
      workspaceId: string
    },
    tx = db,
  ): Promise<string[]> {
    const { refs, workspaceId } = input
    for (const [index, ref] of refs.entries()) {
      if (Boolean(ref.destinationId) === Boolean(ref.inboxId)) {
        throw validationException(
          `targets.${index}`,
          "Give exactly one of destinationId or inboxId.",
        )
      }
    }
    const destinationIds = refs.flatMap((ref) =>
      ref.destinationId ? [ref.destinationId] : [],
    )
    const owned = new Set(
      await publishDestinationRepository.findIdsInWorkspace(
        { ids: destinationIds, workspaceId },
        tx,
      ),
    )
    for (const [index, ref] of refs.entries()) {
      if (ref.destinationId && !owned.has(ref.destinationId)) {
        throw validationException(
          `targets.${index}.destinationId`,
          "Destination not found.",
        )
      }
    }
    const inboxIds = refs.flatMap((ref) => (ref.inboxId ? [ref.inboxId] : []))
    const byInbox = await this.resolveInboxDestinations(
      { inboxIds, workspaceId },
      tx,
    )
    return refs.map((ref, index) => {
      if (ref.destinationId) {
        return ref.destinationId
      }
      const id = ref.inboxId ? byInbox.get(ref.inboxId) : undefined
      if (!id) {
        throw validationException(
          `targets.${index}.inboxId`,
          "This channel cannot publish posts.",
        )
      }
      return id
    })
  }

  /**
   * Records the permissions a connect or reconnect learned for an inbox's
   * destination (`null`: the platform does not report them) and clears an
   * earlier `permissionMissing`: the token just changed. Creates the binding
   * when it is missing; the inbox must belong to the workspace.
   */
  async captureInboxScopes(
    input: {
      grantedScopes: readonly string[] | null
      inboxId: string
      publisherKey: Exclude<PublisherKey, "tiktok">
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await publishDestinationRepository.captureGrantedScopes(
      {
        grantedScopes: input.grantedScopes ? [...input.grantedScopes] : null,
        inboxId: input.inboxId,
        missingScopes: input.grantedScopes
          ? missingPublishScopes(input.publisherKey, input.grantedScopes)
          : [],
        now: new Date(),
        workspaceId: input.workspaceId,
      },
      tx,
    )
    // The token just changed: refresh the picture once the row is committed.
    const [binding] = await publishDestinationRepository.findBindingsByInbox(
      { inboxIds: [input.inboxId], workspaceId: input.workspaceId },
      tx,
    )
    if (binding) {
      await publishDestinationAvatarService.enqueueRefresh({
        delayMs: AVATAR_CONNECT_ENQUEUE_DELAY_MS,
        publishDestinationIds: [binding.id],
        workspaceId: input.workspaceId,
      })
    }
  }

  /** The destinations of the workspace with the state a person sees; never a token. */
  async list(
    input: ListPublishDestinationsInput,
  ): Promise<PublishDestinationList> {
    const { workspaceId } = input
    const providers = input.providers ?? [...INBOX_PROVIDERS, "tiktok"]
    const inboxProviders = providers.filter(
      (provider): provider is InboxPublishProvider => provider !== "tiktok",
    )
    // Bindings of connected inboxes are created on read (idempotent, bounded).
    let truncated = false
    for (const provider of inboxProviders) {
      const inboxes = await publishDestinationRepository.listConnectedInboxes({
        provider,
        workspaceId,
      })
      truncated ||= inboxes.truncated
      await publishDestinationRepository.ensureForInboxes({
        inboxIds: inboxes.rows
          .slice(0, MAX_PUBLISH_INBOXES_PER_PROVIDER)
          .map((row) => row.id),
        workspaceId,
      })
    }
    const rows = await publishDestinationStateRepository.list({
      connectedOnly: input.connectedOnly,
      providers,
      workspaceId,
    })
    const states = input.states
    const { storageUrl } = await resolveTenantSettings({ workspaceId })
    const visible = rows.filter((row) => !states || states.includes(row.state))
    const proxyUrls = await buildDestinationAvatarUrls({
      publishDestinationIds: visible
        .filter(needsAvatarProxy)
        .map((row) => row.id),
      workspaceId,
    })
    return {
      destinations: visible.map((row) =>
        toPublishDestinationDto(row, storageUrl, proxyUrls.get(row.id) ?? null),
      ),
      truncated,
    }
  }

  async get(input: {
    id: string
    workspaceId: string
  }): Promise<PublishDestinationDto> {
    const row = await publishDestinationStateRepository.findById(input)
    if (!row) {
      throw notFoundException("Destination not found")
    }
    const { storageUrl } = await resolveTenantSettings({
      workspaceId: input.workspaceId,
    })
    const proxyUrls = await buildDestinationAvatarUrls({
      publishDestinationIds: needsAvatarProxy(row) ? [row.id] : [],
      workspaceId: input.workspaceId,
    })
    return toPublishDestinationDto(
      row,
      storageUrl,
      proxyUrls.get(row.id) ?? null,
    )
  }
}

export const publishDestinationService = new PublishDestinationService()
