import type { DatabaseClient } from "@chatbotx.io/database/client"
import {
  integrationWhatsappRepository,
  whatsappSignupSessionRepository,
} from "@chatbotx.io/database/repositories"
import type { IntegrationWhatsappModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { dispatchAuditRecordSafely } from "../audit/dispatcher"
import { connectSessionExpiredException } from "../errors"
import {
  auditChannelConnected,
  connectChannelIntegration,
  runConnectTransaction,
} from "../inbox/connect-channel"
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
  return runConnectTransaction("whatsapp", async (tx) => {
    const claim = await claimPhoneNumberForSession(input, tx)

    const { workspaceId, createdWorkspace } = await resolveConnectWorkspace(
      input,
      tx,
      claim,
    )

    const { integration, wasCreated } = await connectChannelIntegration({
      tx,
      ownerId: input.ownerId,
      inboxData: {
        id: createId(),
        workspaceId,
        channel: "whatsapp",
        sourceId: input.phoneNumber.id,
        name: input.phoneNumber.name,
      },
      insertIntegration: (inboxId) =>
        integrationWhatsappRepository.upsertByInbox(
          {
            id: input.integrationId,
            workspaceId,
            inboxId,
            auth: input.auth,
            phoneNumberId: input.phoneNumber.id,
            wabaId: input.wabaId,
            businessId: input.businessId,
            name: input.phoneNumber.name,
            displayPhoneNumber: input.phoneNumber.displayPhoneNumber,
            isCoexist: input.isCoexist,
            platformType: input.platformType,
          },
          tx,
        ),
    })

    return {
      workspaceId,
      createdWorkspace,
      integrationRow: integration,
      wasCreated,
    }
  })
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
