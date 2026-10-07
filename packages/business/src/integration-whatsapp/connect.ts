import type { DatabaseClient } from "@chatbotx.io/database/client"
import {
  connectionRepository,
  integrationWhatsappRepository,
  whatsappSignupSessionRepository,
} from "@chatbotx.io/database/repositories"
import type { IntegrationWhatsappModel } from "@chatbotx.io/database/types"
import type { AuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { dispatchAuditRecordSafely } from "../audit/dispatcher"
import {
  CONNECTION_STORE_BINDINGS,
  type ConnectionQuotaConsumption,
  upsertConnectionRow,
  withQuotaCompensation,
} from "../connection"
import {
  channelDuplicatedException,
  connectSessionExpiredException,
} from "../errors"
import {
  auditChannelConnected,
  runConnectTransaction,
} from "../inbox/connect-channel"
import { inboxService } from "../inbox/service"
import type { WorkspaceQuotaConsumption } from "../workspace/quota-consumption"
import { workspaceService } from "../workspace/service"

/** Signup-session identity threaded through `connectPhoneNumber`'s per-number claim. */
type ConnectPhoneNumberSignupSession = {
  id: string
  userId: string
  ownerId: string
}

export type ConnectPhoneNumberInput = {
  actorUserId: string
  ownerId: string
  /** `null` only on the very first number of a fresh signup session. */
  workspaceId: string | null
  integrationId: string
  phoneNumber: {
    id: string
    /** Verified name, already falling back to the display number if blank. */
    name: string
    displayPhoneNumber: string
  }
  wabaId: string
  businessId: string
  auth: unknown
  isCoexist: boolean
  platformType: string
  /** Present on the session (embedded-signup picker) path: claim + bind inside the tx. */
  signupSession?: ConnectPhoneNumberSignupSession
}

export type ConnectPhoneNumberResult = {
  workspaceId: string
  createdWorkspace: boolean
  integrationRow: IntegrationWhatsappModel
  wasCreated: boolean
}

/**
 * The per-number signup-session claim's outcome: `"noSession"` on the
 * manual / direct OAuth path (no session to claim from), or `"claimed"`
 * with the CLAIMED row's `workspaceId` — the only trustworthy source at
 * this point, since a concurrent request in the same batch may have bound
 * the session's workspace (via `bindSignupSessionWorkspace`) after the
 * caller's own pre-claim read.
 */
type ClaimOutcome =
  | { kind: "noSession" }
  | { kind: "claimed"; workspaceId: string | null }

/**
 * Persists a WhatsApp phone-number connect. One `db.transaction` that:
 * (1) on the session path, atomically claims this number from the signup
 * session (`claimSignupSessionPhoneNumber`) — a null claim means the
 * session itself is gone/expired, which stops the whole batch, not just
 * this item; (2) creates the workspace when `workspaceId` is null (only
 * the first number of a fresh session hits this) and binds it back onto
 * the session so the next number in the batch reuses it; (3) upserts the
 * integration row. The transaction settles with the write — nothing after
 * it may reject, so both audits are logged, never thrown, on failure.
 */
export async function connectPhoneNumber(
  input: ConnectPhoneNumberInput,
): Promise<ConnectPhoneNumberResult> {
  const result = await insertPhoneNumber(input)

  if (result.createdWorkspace) {
    await dispatchAuditRecordSafely(
      {
        userId: input.actorUserId,
        workspaceId: result.workspaceId,
        action: "create",
        detail: `created the workspace (#${result.workspaceId})`,
      },
      "audit dispatch failed after workspace create",
    )
  }

  if (result.wasCreated) {
    await auditChannelConnected({
      channel: "whatsapp",
      actorUserId: input.actorUserId,
      workspaceId: result.workspaceId,
      integrationId: result.integrationRow.id,
    })
  }

  return result
}

function insertPhoneNumber(
  input: ConnectPhoneNumberInput,
): Promise<ConnectPhoneNumberResult> {
  const quotaConsumption: ConnectionQuotaConsumption = {
    consumed: false,
    workspaceUsageIncremented: false,
  }

  const workspaceQuotaConsumption: WorkspaceQuotaConsumption = {
    consumed: false,
  }
  return withQuotaCompensation(
    {
      ownerId: input.ownerId,
      quotaConsumption,
      workspaceQuotaConsumption,
      context: { provider: "whatsapp", actorUserId: input.actorUserId },
    },
    () =>
      runConnectTransaction("whatsapp", async (tx) => {
        const claim = await claimPhoneNumberForSession(input, tx)

        const { workspaceId, createdWorkspace } = await resolveConnectWorkspace(
          input,
          tx,
          claim,
          workspaceQuotaConsumption,
        )

        // `IntegrationWhatsapp.phoneNumberId` is unique platform-wide, not
        // per-workspace, so this pre-check catches a cross-workspace
        // duplicate before it would otherwise only surface as the generic
        // engine's `connectionAlreadyConnectedException` from deep inside
        // `upsertConnectionRow` — losing the specific "already connected to
        // another workspace" outcome the connect UI's `channelDuplicated`
        // mapping expects (`inbox/connect-outcome.ts`).
        if (
          await inboxService.isConnected({
            tx,
            channel: "whatsapp",
            sourceId: input.phoneNumber.id,
            workspaceId,
          })
        ) {
          throw channelDuplicatedException()
        }

        // The revive-or-insert lookup key `saveOrInsertSatellite` needs —
        // present means a `Connection` row for this (workspace, phoneNumberId)
        // already exists (even disconnected), so this is a revive rather
        // than a genuine first-ever connect (`wasCreated` below).
        const existing = await connectionRepository.findByProviderSourceId(
          {
            workspaceId,
            provider: "whatsapp",
            sourceId: input.phoneNumber.id,
          },
          tx,
        )

        const { inbox } = await inboxService.create({
          tx,
          ownerId: input.ownerId,
          data: {
            id: createId(),
            workspaceId,
            channel: "whatsapp",
            sourceId: input.phoneNumber.id,
            name: input.phoneNumber.name,
          },
          skipQuota: true,
        })

        // The satellite write's real insert-vs-update branch key:
        // `IntegrationWhatsapp`'s `onDisconnect: "keep_row"` binding setting
        // only governs the GENERIC engine's own (never invoked, for
        // WhatsApp) delete step — WhatsApp's actual disconnect action
        // (`integration-whatsapp/service.ts`'s `disconnect`) deletes the
        // satellite row directly as part of its own coexist/CAPI cleanup,
        // even though the `Connection` row survives (status flips instead).
        // So a `Connection` row existing is NOT proof the satellite row
        // still exists — check the row itself, by the same `inboxId`
        // `saveOrInsertSatellite` keys its UPDATE-vs-INSERT decision on.
        const satelliteExists = Boolean(
          await integrationWhatsappRepository.findByInboxIdForWorkspace(
            { workspaceId, inboxId: inbox.id },
            tx,
          ),
        )

        await upsertConnectionRow({
          tx,
          workspaceId,
          provider: "whatsapp",
          kind: "channel",
          descriptor: {
            sourceId: input.phoneNumber.id,
            displayName: input.phoneNumber.name,
          },
          auth: input.auth as AuthValue,
          extraConfig: {
            wabaId: input.wabaId,
            businessId: input.businessId,
            displayPhoneNumber: input.phoneNumber.displayPhoneNumber,
            isCoexist: input.isCoexist,
            platformType: input.platformType,
            // Only when the satellite row doesn't already exist (see
            // `store-bindings.ts`'s whatsapp binding comment for why `id`
            // is allow-listed at all). A revive's `saveAuthByForeignKey`
            // UPDATE must never see this key — it would try to overwrite
            // the existing row's own PK.
            ...(satelliteExists ? {} : { id: input.integrationId }),
          },
          existing,
          store: CONNECTION_STORE_BINDINGS.whatsapp as NonNullable<
            (typeof CONNECTION_STORE_BINDINGS)["whatsapp"]
          >,
          ownerId: input.ownerId,
          quotaConsumption,
          actorUserId: input.actorUserId,
          inboxId: inbox.id,
        })

        const integration =
          await integrationWhatsappRepository.findByInboxIdForWorkspace(
            { workspaceId, inboxId: inbox.id },
            tx,
          )
        if (!integration) {
          throw new Error(
            `connectPhoneNumber: IntegrationWhatsapp row missing for inbox ${inbox.id}`,
          )
        }

        return {
          workspaceId,
          createdWorkspace,
          integrationRow: integration,
          // No Connection row for this (workspaceId, phoneNumberId) existed
          // before this call — a genuine first connect, not a revive.
          wasCreated: !existing,
        }
      }),
  )
}

/** Claims this number from its signup session, row-locking it for the rest of the transaction. */
async function claimPhoneNumberForSession(
  input: ConnectPhoneNumberInput,
  tx: DatabaseClient,
): Promise<ClaimOutcome> {
  if (!input.signupSession) {
    return { kind: "noSession" }
  }

  const claimed =
    await whatsappSignupSessionRepository.claimSignupSessionPhoneNumber({
      id: input.signupSession.id,
      userId: input.signupSession.userId,
      ownerId: input.signupSession.ownerId,
      phoneNumberId: input.phoneNumber.id,
      tx,
    })

  if (!claimed) {
    throw connectSessionExpiredException(
      "Your WhatsApp signup session has expired. Please start the connection again.",
      "signupSessionExpired",
    )
  }

  return { kind: "claimed", workspaceId: claimed.workspaceId }
}

async function resolveConnectWorkspace(
  input: ConnectPhoneNumberInput,
  tx: DatabaseClient,
  claim: ClaimOutcome,
  quotaConsumption: WorkspaceQuotaConsumption,
): Promise<{ workspaceId: string; createdWorkspace: boolean }> {
  const trustedWorkspaceId =
    claim.kind === "claimed" ? claim.workspaceId : input.workspaceId

  if (trustedWorkspaceId) {
    return { workspaceId: trustedWorkspaceId, createdWorkspace: false }
  }

  const workspace = await workspaceService.create({
    tx,
    createdBy: input.actorUserId,
    data: {
      name: input.phoneNumber.name,
      timezone: "UTC",
      ownerId: input.actorUserId,
    },
    quotaConsumption,
  })

  if (input.signupSession) {
    await whatsappSignupSessionRepository.bindSignupSessionWorkspace({
      id: input.signupSession.id,
      workspaceId: workspace.id,
      tx,
    })
  }

  return { workspaceId: workspace.id, createdWorkspace: true }
}
