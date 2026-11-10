import type { DatabaseClient } from "@chatbotx.io/database/client"
import { and, db, eq, findOrFail } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import {
  type DueImapInbox,
  integrationSmtpRepository,
} from "@chatbotx.io/database/repositories"
import { integrationSmtpModel } from "@chatbotx.io/database/schema"
import type {
  InboxModel,
  IntegrationSmtpModel,
} from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { isSameJsonValue } from "../audit/diff"
import { BaseService } from "../base.service"
import {
  CONNECTION_STORE_BINDINGS,
  type ConnectionQuotaConsumption,
  upsertConnectionRow,
  withQuotaCompensation,
} from "../connection"
import { connectionStateService } from "../connection/state-service"
import { ChatbotXException } from "../errors"
import { inboxService } from "../inbox/service"
import type { IntegrationSmtpResource } from "./schema"

/**
 * Mirrors `SmtpAuthValue` from `@chatbotx.io/integration-smtp` without
 * importing that package into business (it would pull `nodemailer` +
 * `next-intl` transitively into every business consumer, including the
 * worker). Host/port resolution against `smtpHostMap` stays in the builder
 * and is passed in already resolved.
 */
type SmtpAuthInput = {
  authType: "custom"
  provider: string
  host: string
  port: number
  username: string
  password: string
  imapUsername?: string
  imapPassword?: string
}

/**
 * Where and how mail is read in. Host/port arrive already resolved against the
 * provider's IMAP map by the caller (see `SmtpAuthInput`); `enabled: false`
 * keeps the inbox send-only.
 */
export type SmtpImapInput = {
  enabled: boolean
  host: string | null
  port: number | null
  mailbox: string | null
}

const IMAP_DISABLED: SmtpImapInput = {
  enabled: false,
  host: null,
  port: null,
  mailbox: null,
}

/**
 * Every field is optional: the builder's update form submits only what the
 * user touched, and each missing value falls back to the row's current auth.
 * `host`/`port` must already be resolved against `smtpHostMap` by the caller
 * (see the note above) — this service only fills them from the stored row.
 */
export type UpdateSmtpInput = Partial<{
  provider: string
  host: string
  port: number
  username: string
  password: string
  imapUsername: string | null
  imapPassword: string | null
  fromAddress: string
  imap: SmtpImapInput
}>

/**
 * Dedicated IMAP login: an omitted field keeps the stored value, `null` clears
 * it (back to reusing the SMTP login). Unset keys stay out of the JSON.
 */
const resolveImapCredentials = (
  data: UpdateSmtpInput,
  current: SmtpAuthInput,
): Pick<SmtpAuthInput, "imapUsername" | "imapPassword"> => {
  const imapUsername =
    data.imapUsername === undefined ? current.imapUsername : data.imapUsername
  const imapPassword =
    data.imapPassword === undefined ? current.imapPassword : data.imapPassword
  return {
    ...(imapUsername ? { imapUsername } : {}),
    ...(imapPassword ? { imapPassword } : {}),
  }
}

/**
 * The mailbox login actually used: dedicated IMAP credentials when set, else the
 * SMTP ones. An SMTP-only credential change must not drop the poll cursor
 * (it would skip mail that arrived meanwhile) unless it is also the IMAP login.
 */
const effectiveImapLogin = (auth: SmtpAuthInput): string =>
  JSON.stringify([
    auth.imapUsername ?? auth.username,
    auth.imapPassword ?? auth.password,
  ])

const INBOUND_TOKEN_BYTES = 32

/** 256 random bits as hex: the secret path segment of the inbound webhook URL. */
const generateInboundToken = (): string => {
  const bytes = globalThis.crypto.getRandomValues(
    new Uint8Array(INBOUND_TOKEN_BYTES),
  )
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  )
}

/** Pause before an IMAP inbox that failed to poll is tried again. */
const IMAP_FAILURE_BACKOFF_MS = 10 * 60 * 1000
const MAX_POLL_ERROR_LENGTH = 500

/** Only the provider name of the stored auth; the rest of it is secret. */
const readProvider = (auth: unknown): string => {
  const provider =
    typeof auth === "object" && auth !== null
      ? (auth as { provider?: unknown }).provider
      : undefined
  return typeof provider === "string" ? provider : "other"
}

/**
 * Public projection of a row. Never spread the row: it carries `auth`
 * (the SMTP/IMAP passwords).
 */
export const toResource = (
  row: Pick<
    IntegrationSmtpModel,
    | "id"
    | "name"
    | "fromAddress"
    | "imapEnabled"
    | "imapHost"
    | "imapPort"
    | "imapMailbox"
    | "lastPolledAt"
    | "lastPollError"
    | "auth"
    | "inboundToken"
  >,
): IntegrationSmtpResource => ({
  id: row.id,
  name: row.name,
  fromAddress: row.fromAddress,
  imapEnabled: row.imapEnabled,
  imapHost: row.imapHost,
  imapPort: row.imapPort,
  imapMailbox: row.imapMailbox,
  lastPolledAt: row.lastPolledAt,
  lastPollError: row.lastPollError,
  provider: readProvider(row.auth),
  inboundWebhookIssued: Boolean(row.inboundToken),
})

class IntegrationSmtpService extends BaseService {
  listDueImapInboxes(props: {
    now?: Date
    limit: number
  }): Promise<DueImapInbox[]> {
    return integrationSmtpRepository.listDueImapInboxes({
      now: props.now ?? new Date(),
      limit: props.limit,
    })
  }

  findForPoll(id: string): Promise<IntegrationSmtpModel | undefined> {
    return integrationSmtpRepository.findById(id)
  }

  recordPollSuccess(props: {
    id: string
    uidValidity: number
    lastUid: number
  }): Promise<void> {
    return integrationSmtpRepository.recordPollSuccess({
      ...props,
      polledAt: new Date(),
    })
  }

  /** Stores the failure and pushes the next poll out so a bad login is not hammered. */
  recordPollFailure(props: { id: string; error: string }): Promise<void> {
    const now = new Date()
    return integrationSmtpRepository.recordPollFailure({
      id: props.id,
      error: props.error.slice(0, MAX_POLL_ERROR_LENGTH),
      polledAt: now,
      nextPollAt: new Date(now.getTime() + IMAP_FAILURE_BACKOFF_MS),
    })
  }

  /** Webhook ingress lookup: the token is the only credential, so no workspace scope here. */
  findByInboundToken(token: string): Promise<IntegrationSmtpModel | undefined> {
    return integrationSmtpRepository.findByInboundToken(token)
  }

  /** The inbox's webhook token, minted on first use so existing rows need no backfill. */
  async getOrCreateInboundToken(props: {
    workspaceId: string
    id: string
  }): Promise<string> {
    const row = await this.findByIdForWorkspace(props)
    if (row.inboundToken) {
      return row.inboundToken
    }
    const minted = await integrationSmtpRepository.setInboundTokenIfUnset({
      ...props,
      token: generateInboundToken(),
    })
    if (minted?.inboundToken) {
      return minted.inboundToken
    }
    // Lost the race: another call minted first, so return its token.
    const winner = await this.findByIdForWorkspace(props)
    if (!winner.inboundToken) {
      throw new ChatbotXException("SMTP inbound token could not be created")
    }
    return winner.inboundToken
  }

  /** Invalidates the old URL immediately; the provider must be pointed at the new one. */
  async rotateInboundToken(props: {
    workspaceId: string
    id: string
  }): Promise<string> {
    await this.findByIdForWorkspace(props)
    const token = generateInboundToken()
    const updated = await integrationSmtpRepository.setInboundToken({
      ...props,
      token,
    })
    if (!updated) {
      throw new ChatbotXException("SMTP integration not found")
    }
    await this.audit("update", "rotated the SMTP inbound webhook token")
    return token
  }

  find({
    where,
  }: {
    where: Partial<{ workspaceId: string; id: string }>
  }): Promise<IntegrationSmtpModel | undefined> {
    return db.query.integrationSmtpModel.findFirst({
      where,
    })
  }

  findByIdForWorkspace(props: {
    id: string
    workspaceId: string
  }): Promise<IntegrationSmtpModel> {
    return findOrFail({
      table: integrationSmtpModel,
      where: { id: props.id, workspaceId: props.workspaceId },
      message: "SMTP integration not found",
    })
  }

  async listByWorkspace(
    workspaceId: string,
  ): Promise<IntegrationSmtpResource[]> {
    const data = await db.query.integrationSmtpModel.findMany({
      where: { workspaceId },
      orderBy: {
        createdAt: "desc",
      },
    })

    return data.map(toResource)
  }

  async connect(input: {
    workspaceId: string
    ownerId: string
    name: string
    fromAddress: string
    auth: SmtpAuthInput
    imap?: SmtpImapInput
  }): Promise<{ inbox: InboxModel; wasCreated: boolean; smtpId: string }> {
    const { workspaceId, ownerId, name, fromAddress, auth } = input
    const imap = input.imap ?? IMAP_DISABLED

    const smtpId = createId()
    const quotaConsumption: ConnectionQuotaConsumption = {
      consumed: false,
      workspaceUsageIncremented: false,
    }

    const { inbox, wasCreated } = await withQuotaCompensation(
      {
        ownerId,
        quotaConsumption,
        context: { provider: "smtp" },
      },
      () =>
        db.transaction(async (tx) => {
          const { inbox, wasCreated } = await inboxService.create({
            tx,
            ownerId,
            data: {
              id: smtpId,
              workspaceId,
              channel: channelTypes.enum.smtp,
              name,
              sourceId: smtpId,
            },
            skipQuota: true,
          })

          // `id === inboxId === sourceId` — the smtp binding's
          // `identityColumn: "id"` (`store-bindings.ts`) sets `IntegrationSmtp
          // .id` to this same `smtpId` on insert, keeping one id for the
          // inbox, the integration row, and the connection's sourceId.
          await upsertConnectionRow({
            tx,
            workspaceId,
            provider: "smtp",
            kind: "channel",
            descriptor: { sourceId: smtpId, displayName: name },
            auth,
            extraConfig: {
              fromAddress,
              imapEnabled: imap.enabled,
              imapHost: imap.host,
              imapPort: imap.port,
              imapMailbox: imap.mailbox,
            },
            existing: undefined,
            store: CONNECTION_STORE_BINDINGS.smtp as NonNullable<
              (typeof CONNECTION_STORE_BINDINGS)["smtp"]
            >,
            ownerId,
            quotaConsumption,
            inboxId: inbox.id,
          })

          return { inbox, wasCreated }
        }),
    )

    if (wasCreated) {
      await this.audit("connect", `connected a new SMTP channel (#${inbox.id})`)
    }

    return { inbox, wasCreated, smtpId }
  }

  /**
   * Merges `data` over the row's stored auth, writes it, and records an audit
   * entry only when the resulting payload actually differs. Both the merge and
   * the diff live here so any future caller (public API, worker) gets them for
   * free — see `.agents/rules/data-access.md` on public and private paths
   * sharing one service method.
   */
  async update(input: {
    workspaceId: string
    id: string
    data: UpdateSmtpInput
    tx?: DatabaseClient
  }): Promise<IntegrationSmtpModel> {
    const { workspaceId, id, data, tx = db } = input

    const integration = await this.findByIdForWorkspace({ id, workspaceId })
    const currentAuth = integration.auth as SmtpAuthInput

    const auth: SmtpAuthInput = {
      authType: "custom",
      provider: data.provider ?? currentAuth.provider,
      host: data.host || currentAuth.host,
      port: data.port || currentAuth.port,
      username: data.username ?? currentAuth.username,
      password: data.password ?? currentAuth.password,
      ...resolveImapCredentials(data, currentAuth),
    }
    const name = data.username ?? integration.name
    const fromAddress = data.fromAddress ?? integration.fromAddress
    const imap: SmtpImapInput = data.imap ?? {
      enabled: integration.imapEnabled,
      host: integration.imapHost,
      port: integration.imapPort,
      mailbox: integration.imapMailbox,
    }
    // A different mailbox (or credentials) has its own UID space: drop the
    // cursor so the next poll re-baselines instead of trusting a stale UID.
    const isImapSourceChanged =
      imap.enabled !== integration.imapEnabled ||
      imap.host !== integration.imapHost ||
      imap.port !== integration.imapPort ||
      imap.mailbox !== integration.imapMailbox ||
      effectiveImapLogin(auth) !== effectiveImapLogin(currentAuth)

    // Scoped by workspace as well as id: `findByIdForWorkspace` above already
    // proves ownership, but this method accepts a `workspaceId` and must
    // honour it rather than trusting every future caller to guard first.
    const [updated] = await tx
      .update(integrationSmtpModel)
      .set({
        auth,
        name,
        fromAddress,
        imapEnabled: imap.enabled,
        imapHost: imap.host,
        imapPort: imap.port,
        imapMailbox: imap.mailbox,
        ...(isImapSourceChanged
          ? {
              imapUidValidity: null,
              imapLastUid: null,
              lastPollError: null,
              imapNextPollAt: null,
            }
          : {}),
      })
      .where(
        and(
          eq(integrationSmtpModel.id, id),
          eq(integrationSmtpModel.workspaceId, workspaceId),
        ),
      )
      .returning()

    if (!updated) {
      throw new ChatbotXException("SMTP integration not found")
    }

    const hasChanged = !isSameJsonValue(
      { auth, name, fromAddress, imap },
      {
        auth: currentAuth,
        name: integration.name,
        fromAddress: integration.fromAddress,
        imap: {
          enabled: integration.imapEnabled,
          host: integration.imapHost,
          port: integration.imapPort,
          mailbox: integration.imapMailbox,
        },
      },
    )

    if (hasChanged) {
      await this.audit("update", "updated the SMTP channel configuration")
    }

    return updated
  }

  async disconnect(input: {
    workspaceId: string
    id: string
    inboxId: string
    ownerId: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, id, inboxId, ownerId, tx } = input

    const run = async (client: DatabaseClient) => {
      await client
        .delete(integrationSmtpModel)
        .where(
          and(
            eq(integrationSmtpModel.id, id),
            eq(integrationSmtpModel.workspaceId, workspaceId),
          ),
        )

      await connectionStateService.disconnectInbox({
        inboxId,
        ownerId,
        workspaceId,
        tx: client,
      })
    }

    if (tx) {
      await run(tx)
    } else {
      await db.transaction(run)
    }

    await this.audit("disconnect", `disconnected the SMTP channel (#${id})`)
  }
}
export const integrationSmtpService = new IntegrationSmtpService()
