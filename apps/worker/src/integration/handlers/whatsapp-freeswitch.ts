import {
  agentPresenceService,
  broadcastToWorkspaceParty,
  ensureCallRow,
  parseAgentSipUsername,
  resolveTerminalStatus,
  SIP_TERM_STATUS_TO_ERROR,
} from "@chatbotx.io/business"
import {
  integrationWhatsappRepository,
  whatsappCallRepository,
} from "@chatbotx.io/database/repositories"
import type { WhatsappCallModel } from "@chatbotx.io/database/types"
import { setWebhookExecutionContext } from "@chatbotx.io/events"
import {
  RealtimeEventType,
  type RealtimeEventWhatsappCallEnded,
  type RealtimeEventWhatsappCallRinging,
} from "@chatbotx.io/partysocket-config"
import {
  type FreeswitchEventKind,
  getFreeswitchRecordingsQueue,
  type IntegrationJobWhatsappFreeswitchEvent,
} from "@chatbotx.io/worker-config"
import { isBlockedWorkspace } from "../../lib/is-blocked-workspace"
import { logger } from "../../lib/logger"
import { finalizeCallSideEffects } from "./shared/whatsapp-call-finalize"
import { resolveFreeswitchCallParticipants } from "./shared/whatsapp-call-participants"

type FreeswitchEventData = IntegrationJobWhatsappFreeswitchEvent["data"]

const REGISTRATION_KIND_BY_EVENT: Record<
  | "CUSTOM:sofia::register"
  | "CUSTOM:sofia::unregister"
  | "CUSTOM:sofia::expire",
  "register" | "unregister" | "expire"
> = {
  "CUSTOM:sofia::register": "register",
  "CUSTOM:sofia::unregister": "unregister",
  "CUSTOM:sofia::expire": "expire",
}

/** Default presence TTL used when the ESL registration event's `expires` header (sofia_reg.c, VERIFIED — see `keep-rule.ts`) is absent/unparseable. */
const DEFAULT_PRESENCE_TTL_SECONDS = 3600

const emitRinging = async (
  call: WhatsappCallModel,
  rootUuid: string,
): Promise<void> => {
  const contactInboxId = call.contactInboxId
  const data: RealtimeEventWhatsappCallRinging["data"] = {
    callId: call.id,
    correlationId: call.wacid ?? call.attemptId ?? call.id,
    rootUuid,
    direction: call.direction,
    conversationId: call.conversationId,
    contactInboxId,
  }
  try {
    await broadcastToWorkspaceParty(call.workspaceId, {
      eventType: RealtimeEventType.whatsappCallRinging,
      data,
    })
  } catch (error) {
    logger.warn(
      { err: error, callId: call.id },
      "Whatsapp FreeSWITCH: unable to emit whatsappCallRinging",
    )
  }
}

const emitEnded = async (
  call: WhatsappCallModel,
  rootUuid: string,
  status: "completed" | "rejected" | "failed",
): Promise<void> => {
  const data: RealtimeEventWhatsappCallEnded["data"] = {
    callId: call.id,
    correlationId: call.wacid ?? call.attemptId ?? call.id,
    rootUuid,
    status,
  }
  try {
    await broadcastToWorkspaceParty(call.workspaceId, {
      eventType: RealtimeEventType.whatsappCallEnded,
      data,
    })
  } catch (error) {
    logger.warn(
      { err: error, callId: call.id },
      "Whatsapp FreeSWITCH: unable to emit whatsappCallEnded",
    )
  }
}

/**
 * `CUSTOM cbx::call` — the dialplan-emitted event that creates the call row
 * (`CHANNEL_CREATE` is deliberately not subscribed). Idempotent on
 * `uuid`: `ensureCallRow`'s inbound/outbound strategies both upsert, so a
 * redelivered event never creates a second row.
 */
const handleCbxCall = async (data: FreeswitchEventData): Promise<void> => {
  setWebhookExecutionContext({ source: "webhook" })
  const call = await ensureCallRow({
    rootUuid: data.uuid,
    integrationId: data.integrationId,
    vars: data.vars,
    resolveParticipants: (input) =>
      resolveFreeswitchCallParticipants({
        ...input,
        workspaceId: data.workspaceId,
      }),
  })

  if (call.direction === "userInitiated" && call.status === "ringing") {
    await emitRinging(call, data.uuid)
  }
}

/**
 * Thrown when a bridged B-leg event arrives before the call row exists: the
 * agent leg's own numbers cannot enrich the row, so the job is retried
 * (BullMQ attempts) and the `cbx::call`/root-leg event creates it meanwhile.
 */
class FreeswitchCallRowNotReadyError extends Error {
  constructor(rootUuid: string) {
    super(`freeswitch-call-row-not-ready: no WhatsappCall row for ${rootUuid}`)
    this.name = "FreeswitchCallRowNotReadyError"
  }
}

/**
 * Lifecycle events are processed concurrently with `cbx::call`, so an
 * answer/hangup may win the race. Recover instead of acknowledging a
 * terminal event without a row (a lost `cbx::call` must still yield a
 * finalized row): the ROOT leg (or an outbound leg carrying the attempt
 * id) goes through the same idempotent `ensureCallRow`; a bridged agent
 * B-leg cannot enrich the row and is retried.
 */
const findOrEnsureCallRow = async (
  data: FreeswitchEventData,
  rootUuid: string,
): Promise<WhatsappCallModel> => {
  const existing = await whatsappCallRepository.findByFreeswitchUuid(rootUuid)
  if (existing) {
    return existing
  }
  const canEnrich = data.uuid === rootUuid || Boolean(data.vars.attemptId)
  if (!canEnrich) {
    throw new FreeswitchCallRowNotReadyError(rootUuid)
  }
  logger.warn(
    { rootUuid, event: data.event },
    "Whatsapp FreeSWITCH lifecycle event arrived before the call row; creating it",
  )
  return await ensureCallRow({
    rootUuid,
    integrationId: data.integrationId,
    vars: data.vars,
    resolveParticipants: (input) =>
      resolveFreeswitchCallParticipants({
        ...input,
        workspaceId: data.workspaceId,
      }),
  })
}

/**
 * `CHANNEL_ANSWER`. Only a bridged agent B-leg (profile `agents`,
 * `variable_cbx_root_uuid` = the call's `freeswitchUuid`) means the call was
 * accepted: it advances to `accepted` and records who answered — a no-op if
 * the row already moved past `accepted` (guarded by `finalizeById`'s
 * status-rank check). The ROOT (Meta) leg is answered early by the
 * inbound dialplan to keep RTP flowing while agents ring, so its own answer
 * proves nothing about acceptance: it only creates/recovers the row.
 */
const handleChannelAnswer = async (
  data: FreeswitchEventData,
): Promise<void> => {
  setWebhookExecutionContext({ source: "webhook" })
  const rootUuid = data.vars.rootUuid ?? data.uuid
  const call = await findOrEnsureCallRow(data, rootUuid)
  if (data.uuid === rootUuid) {
    return
  }

  const answeredByUserId = parseAgentUserIdSafely(data.vars.sipToUser)
  await whatsappCallRepository.finalizeById({
    id: call.id,
    status: "accepted",
    answeredByUserId: answeredByUserId ?? null,
    freeswitchBLegUuid: data.uuid,
    current: call,
  })
}

const parseAgentUserIdSafely = (
  username: string | undefined,
): string | undefined => {
  if (!username) {
    return
  }
  try {
    return parseAgentSipUsername(username).userId
  } catch {
    return
  }
}

/**
 * `CHANNEL_HANGUP_COMPLETE` — the A-leg (root channel) terminating resolves
 * the terminal status via {@link resolveTerminalStatus} and runs the SAME
 * `finalizeCallSideEffects` (activity message, flow-state, tracking,
 * realtime `messageCreated`, trigger events) the Meta `terminate` webhook
 * uses — both are keyed on the id-based `sourceId`, so whichever lands
 * first writes the activity and the other is a no-op — there is no
 * second implementation. The call-specific realtime `whatsappCallEnded`
 * signal (dismiss call UI) is emitted here in addition, ahead of the
 * webhook, since FreeSWITCH is the fast local signal. A B-leg hangup (the
 * outbound Meta gateway leg failing) instead records `lastError` from the
 * SIP final-response code without ending the row twice —
 * `finalizeById`'s status-rank guard makes both paths idempotent on
 * redelivery.
 */
const handleChannelHangupComplete = async (
  data: FreeswitchEventData,
): Promise<void> => {
  setWebhookExecutionContext({ source: "webhook" })
  const rootUuid = data.vars.rootUuid ?? data.uuid
  const call = await findOrEnsureCallRow(data, rootUuid)

  const isALeg = data.uuid === rootUuid
  if (!isALeg) {
    // A B-leg ending never terminates the call: an inbound fork keeps
    // ringing the other agents, and an outbound gateway failure is followed
    // by the A-leg's own HANGUP_COMPLETE (`hangup_after_bridge=true`), which
    // carries the bridge's failure cause and finalizes the row exactly once.
    const lastError = data.vars.sipTermStatus
      ? SIP_TERM_STATUS_TO_ERROR[data.vars.sipTermStatus]
      : undefined
    await whatsappCallRepository.recordBLegOutcome({
      id: call.id,
      freeswitchBLegUuid: data.uuid,
      lastError,
    })
    return
  }

  const wacid = data.vars.sipHeaders?.["x-wa-meta-wacid"]
  const attached =
    wacid && !call.wacid
      ? await whatsappCallRepository.attachWacid({ id: call.id, wacid })
      : undefined
  const current = attached ?? call

  const resolved = resolveTerminalStatus({
    cause: data.vars.hangupCause ?? "NORMAL_CLEARING",
    priorStatus: current.status,
  })
  // resolveTerminalStatus only ever returns a terminal status, but its
  // return type is the full WhatsappCallStatus union — narrow explicitly so
  // both the realtime event and the activity entity stay well-typed.
  if (
    !(
      resolved === "completed" ||
      resolved === "rejected" ||
      resolved === "failed"
    )
  ) {
    return
  }

  await emitEnded(current, rootUuid, resolved)

  await finalizeCallSideEffects({
    call: current,
    entity: {
      type: "whatsapp_call",
      direction: current.direction,
      status: resolved,
    },
  })
}

/**
 * `RECORD_STOP` — enqueues the node-scoped upload job. Deterministic
 * `jobId` (shared with the recording-file sweep) makes a redelivery a
 * BullMQ no-op.
 */
const handleRecordStop = async (data: FreeswitchEventData): Promise<void> => {
  const rootUuid = data.vars.rootUuid ?? data.uuid
  const path = data.vars.recordFilePath
  if (!path) {
    logger.warn(
      { rootUuid },
      "Whatsapp FreeSWITCH RECORD_STOP missing file path",
    )
    return
  }
  await getFreeswitchRecordingsQueue(data.nodeId).add(
    "callRecordingUpload",
    {
      type: "callRecordingUpload",
      data: {
        channel: "whatsapp",
        nodeId: data.nodeId,
        workspaceId: data.workspaceId,
        integrationId: data.integrationId,
        rootUuid,
        path,
        vars: data.vars.attemptId
          ? { attemptId: data.vars.attemptId }
          : undefined,
      },
    },
    { jobId: `rec-upload-${rootUuid}` },
  )
}

/**
 * `sofia::register|unregister|expire` on the `agents` profile — bounds ring
 * fan-out; correctness never depends on it. The raw
 * username/contact are carried in `vars.sipFromUser`/`sipToUser` by
 * `keep-rule.ts`, which reads the VERIFIED `sofia_reg.c` header names (its
 * `REGISTRATION_IDENTITY_HEADERS_BY_SUBCLASS` table — `from-user`/`from-host`
 * for register/unregister, `user`/`host` for expire) since this file must
 * stay WhatsApp/agent agnostic.
 */
const handleRegistrationEvent =
  (
    kind:
      | "CUSTOM:sofia::register"
      | "CUSTOM:sofia::unregister"
      | "CUSTOM:sofia::expire",
  ) =>
  async (data: FreeswitchEventData): Promise<void> => {
    const username = data.vars.sipFromUser
    if (!username) {
      return
    }
    const expiresSeconds = Number(data.vars.sipTermStatus)
    const ttlSeconds =
      Number.isFinite(expiresSeconds) && expiresSeconds > 0
        ? expiresSeconds
        : DEFAULT_PRESENCE_TTL_SECONDS

    try {
      // These events carry no `workspaceId` on the wire (enqueued by
      // `keep-rule.ts` with `workspaceId: ""`), so the integration worker's
      // generic pre-check cannot guard them — resolve the workspace from
      // the SIP username and guard here instead.
      const { workspaceId } = parseAgentSipUsername(username)
      if (await isBlockedWorkspace(workspaceId)) {
        return
      }

      await agentPresenceService.applyRegistrationEvent({
        kind: REGISTRATION_KIND_BY_EVENT[kind],
        username,
        contact: data.vars.sipToUser ?? null,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      })
    } catch (error) {
      logger.warn(
        { err: error, username },
        "Whatsapp FreeSWITCH registration event skipped: invalid username",
      )
    }
  }

/**
 * `sofia::gateway_state` for a `wa-<integrationId>` gateway — logs and
 * records `sipLastError` when the gateway goes down. The gateway
 * name is carried in `vars.sipToUser` by `keep-rule.ts`, sourced from the
 * VERIFIED `Gateway`/`State` headers (`sofia_reg_fire_custom_gateway_state_event`,
 * `sofia_reg.c:157-169`).
 */
const handleGatewayState = async (data: FreeswitchEventData): Promise<void> => {
  const gatewayName = data.vars.sipToUser
  const state = data.vars.sipTermStatus
  if (!gatewayName) {
    return
  }
  logger.info(
    { gatewayName, state },
    "Whatsapp FreeSWITCH gateway state changed",
  )

  if (!(state === "DOWN" || state === "FAILED" || state === "FAIL_WAIT")) {
    return
  }
  const integration =
    await integrationWhatsappRepository.findByGatewayName(gatewayName)
  if (!integration?.sipProvisioningClaim) {
    return
  }
  // No `workspaceId` on the wire for this event either — guard inline
  // before writing, same reasoning as `handleRegistrationEvent`.
  if (await isBlockedWorkspace(integration.workspaceId)) {
    return
  }
  await integrationWhatsappRepository.updateSipProvisioning({
    id: integration.id,
    workspaceId: integration.workspaceId,
    claim: integration.sipProvisioningClaim,
    values: { sipLastError: `gateway ${gatewayName} state ${state}` },
  })
}

/**
 * Table-driven dispatch by `FreeswitchEventKind` ("no confusing
 * if/else"). Call and recording events (`cbx::call`, `CHANNEL_ANSWER`,
 * `CHANNEL_HANGUP_COMPLETE`, `RECORD_STOP`) carry a real `workspaceId` and
 * are guarded by the integration worker's generic pre-check
 * (`isBlockedWorkspace`, `apps/worker/src/integration/worker.ts`) via
 * `job.data.data.workspaceId`. Registration and gateway events are enqueued
 * with `workspaceId: ""` by `keep-rule.ts` (they are node-global, not tied to
 * a call), so that pre-check cannot protect them — `handleRegistrationEvent`
 * and `handleGatewayState` resolve the workspace themselves and guard
 * inline before writing.
 */
export const FREESWITCH_EVENT_HANDLERS: Record<
  FreeswitchEventKind,
  (data: FreeswitchEventData) => Promise<void>
> = {
  "CUSTOM:cbx::call": handleCbxCall,
  CHANNEL_ANSWER: handleChannelAnswer,
  CHANNEL_HANGUP_COMPLETE: handleChannelHangupComplete,
  RECORD_STOP: handleRecordStop,
  "CUSTOM:sofia::register": handleRegistrationEvent("CUSTOM:sofia::register"),
  "CUSTOM:sofia::unregister": handleRegistrationEvent(
    "CUSTOM:sofia::unregister",
  ),
  "CUSTOM:sofia::expire": handleRegistrationEvent("CUSTOM:sofia::expire"),
  "CUSTOM:sofia::gateway_state": handleGatewayState,
}

export const handleWhatsappFreeswitchEvent = async (
  data: FreeswitchEventData,
): Promise<void> => {
  const handler = FREESWITCH_EVENT_HANDLERS[data.event]
  await handler(data)
}
