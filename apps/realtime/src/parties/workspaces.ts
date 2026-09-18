import { verifyMemberConnectToken } from "@chatbotx.io/partysocket-config/auth"
import {
  PRESENCE_REPORT_INTERVAL_MS,
  presencePingMessageSchema,
} from "@chatbotx.io/partysocket-config/presence"
import type * as Party from "partykit/server"
import { env } from "../env"
import { toUserConnectionTag } from "../lib/connection-tags"
import { reportWorkspacePresence } from "../lib/presence-report"
import { verifyBroadcastRequest } from "../lib/realtime-auth"
import { logger } from "../logger"

const REVOKE_ACTION = "revoke"
const TARGET_USER_QUERY_PARAM = "userId"
const ACTION_QUERY_PARAM = "action"
const REVOKE_CLOSE_CODE = 4001
const REVOKE_CLOSE_REASON = "Revoked"

/**
 * How often each room reports its connected user ids to the builder. Owned
 * by `@chatbotx.io/partysocket-config/presence` alongside `PRESENCE_TTL_MS`;
 * re-exported here so existing importers of this module keep working.
 */
export { PRESENCE_REPORT_INTERVAL_MS } from "@chatbotx.io/partysocket-config/presence"

/** Durable-storage key this room's own id is cached under, so `onAlarm` never
 * needs to read `room.id` — PartyKit's alarm handler explicitly does NOT
 * have access to `Party.id` (see this file's `onAlarm` doc comment). */
const PRESENCE_WORKSPACE_ID_STORAGE_KEY = "presenceWorkspaceId"

/**
 * Epoch ms of the last time the report loop was confirmed armed — set by a
 * bootstrap and refreshed by every `onAlarm` tick. This is the self-healing
 * signal, and it deliberately does NOT use `room.storage.getAlarm()`.
 *
 * `getAlarm() !== null` only says an alarm is SCHEDULED, not that it will
 * fire. If delivery is ever lost (restart timing, a supervisor handoff, a
 * runtime alarm gap) it reports "armed" forever while nothing ticks — and a
 * bootstrap that only runs on `null` would never recover, so presence would
 * expire after `PRESENCE_TTL_MS` with tabs still open. Found live against
 * the local `partykit dev` stack.
 *
 * Tracking freshness instead fixes that: `ensureReportLoopArmed` (from
 * `onConnect`, `onRequest` and the client ping) re-bootstraps whenever this
 * is missing or older than {@link REPORT_LOOP_STALE_THRESHOLD_MS}, whatever
 * `getAlarm()` says. A healthy loop refreshes it every interval, so only a
 * loop that really stopped goes stale — and it converges back on its own
 * without needing to know what broke it.
 */
const PRESENCE_LAST_ARMED_AT_STORAGE_KEY = "presenceLastArmedAt"

/**
 * How long {@link PRESENCE_LAST_ARMED_AT_STORAGE_KEY} may go unrefreshed
 * before the loop counts as dead. A multiple of the interval, not equal to
 * it: the half-interval of slack absorbs ordinary jitter (GC pause, slow
 * POST, a connect between ticks) without re-bootstrapping on every request,
 * while staying under the presence TTL so healing beats expiry.
 */
const REPORT_LOOP_STALE_THRESHOLD_MS = PRESENCE_REPORT_INTERVAL_MS * 1.5

type PresenceConnectionState = { userId: string }

export default class WorkspaceParty implements Party.Server {
  // biome-ignore lint/style/noParameterProperties: wip
  constructor(readonly room: Party.Room) {}

  /**
   * Serializes the "arm the report loop" section (`ensureReportLoopArmed`
   * below) across concurrent `onConnect` calls (MEDIUM-c, round-2 review).
   * A real Durable Object keeps its input gate closed across storage awaits
   * but OPENS it across a genuine fetch await (`reportWorkspacePresence`),
   * so two connections racing in during a reconnect storm (every tab after
   * a realtime redeploy) could otherwise both observe the loop as
   * unarmed/stale before either had re-armed it, and both POST. Every
   * `onConnect` call now awaits the PREVIOUS call's section before running
   * its own — a harness-independent guarantee, not reliant on exactly how
   * any given runtime schedules concurrent events — so only one call can
   * ever act on a given stale/unarmed state at a time.
   */
  private bootstrapLock: Promise<void> = Promise.resolve()

  async onConnect(
    connection: Party.Connection,
    { request }: Party.ConnectionContext,
  ) {
    const userId = request.headers.get("X-User-ID")
    if (!userId) {
      connection.close(1008, "Unauthorized")
      return
    }

    // Set BEFORE acquiring the bootstrap lock: whichever concurrent
    // `onConnect` call ends up running the arm section can then see every
    // connection's state that was already set, including ones still
    // queued behind the lock (MEDIUM-c) — see `ensureReportLoopArmed`.
    connection.setState({ userId } satisfies PresenceConnectionState)

    await this.armReportLoopSerialized(userId)
  }

  /**
   * Serializes a call to {@link ensureReportLoopArmed} against every other
   * concurrent caller of this method — `onConnect` (with `seedUserId`) and
   * `onMessage`'s ping handler (below, no seed — the pinging connection is
   * already registered on the room by the time it can ping). Extracted out
   * of `onConnect` so the SAME lock also protects the ping path: a flood of
   * pings arriving concurrently (e.g. many tabs reconnecting and pinging at
   * once) must still only ever let ONE caller act on a given stale/unarmed
   * state, exactly like the original `onConnect`-vs-`onConnect` race this
   * lock was built for (MEDIUM-c, round-2 review). `ensureReportLoopArmed`
   * itself stays idempotent via the freshness gate, so serializing merely
   * removes the window where two concurrent callers could both observe
   * "stale" before either had re-armed it — it is not the only thing
   * preventing a double re-arm, but it removes the race entirely rather
   * than relying on timing.
   */
  private async armReportLoopSerialized(seedUserId?: string): Promise<void> {
    const previousLock = this.bootstrapLock
    // Definite-assignment: the Promise executor below runs SYNCHRONOUSLY
    // (a JS/spec guarantee), so `releaseLock` is always assigned before
    // this line finishes executing, well before the `finally` below reads it.
    let releaseLock!: () => void
    this.bootstrapLock = new Promise((resolve) => {
      releaseLock = resolve
    })
    await previousLock
    try {
      await this.ensureReportLoopArmed(seedUserId)
    } finally {
      releaseLock()
    }
  }

  /**
   * Arms (or re-arms) the recurring report loop and reports presence
   * immediately, but ONLY when it actually needs to — see
   * {@link PRESENCE_LAST_ARMED_AT_STORAGE_KEY} for why freshness, not
   * `getAlarm()`, is the gate. Two callers:
   *  - `onConnect` (with `seedUserId`): the room's first connection (or any
   *    connection landing after the loop went stale) bootstraps it.
   *  - `onRequest` (no `seedUserId`): every workspace-wide broadcast/send
   *    is a second, independent chance to notice and recover a stalled
   *    loop without waiting for a new connect — see `onRequest`.
   *
   * No-ops entirely (never touches storage) when there is nobody to
   * report: `collectConnectedUserIds()` unioned with `seedUserId` is
   * empty. This matters for the `onRequest` caller specifically — a
   * broadcast can land on a workspace with zero current connections, and
   * that must never arm an alarm for a room nothing is driving.
   *
   * Reports IMMEDIATELY rather than waiting for the next tick: a room's
   * first connection (every redeploy, every agent opening the inbox first)
   * would otherwise leave a `PRESENCE_REPORT_INTERVAL_MS` window with nobody
   * online, during which an inbound call is rejected as "nobody online".
   *
   * The alarm is armed BEFORE awaiting the POST, so a Durable Object's input
   * gate — which opens during that await — can never let a concurrent caller
   * see an unarmed alarm. The report covers everyone already visible plus
   * `seedUserId`, since `onConnect` sets state before taking the lock and
   * other connections may already be queued: one report for all of them
   * beats each racing to send its own.
   */
  private async ensureReportLoopArmed(seedUserId?: string): Promise<void> {
    const userIds = new Set(this.collectConnectedUserIds())
    if (seedUserId) {
      userIds.add(seedUserId)
    }
    if (userIds.size === 0) {
      return
    }

    const now = Date.now()
    const lastArmedAt = await this.room.storage.get<number>(
      PRESENCE_LAST_ARMED_AT_STORAGE_KEY,
    )
    const isLoopFresh =
      lastArmedAt !== undefined &&
      now - lastArmedAt < REPORT_LOOP_STALE_THRESHOLD_MS
    if (isLoopFresh) {
      return
    }

    await this.room.storage.put(PRESENCE_WORKSPACE_ID_STORAGE_KEY, this.room.id)
    await this.room.storage.put(PRESENCE_LAST_ARMED_AT_STORAGE_KEY, now)
    await this.room.storage.setAlarm(now + PRESENCE_REPORT_INTERVAL_MS)

    await reportWorkspacePresence(this.room.id, [...userIds])
  }

  /**
   * Stops the report loop the moment the room goes empty — computed by
   * excluding `connection` itself (rather than trusting `getConnections()`
   * to have already dropped it), so this is correct regardless of exactly
   * when PartyKit removes a closing connection from the room's own
   * bookkeeping relative to firing `onClose`.
   *
   * Deliberately does NOT also send an immediate "went offline" report:
   * `presenceHeartbeatMany` only ever ADDS/renews members, it never
   * removes one — there is no explicit sign-off any more (relies purely on
   * TTL expiry, see `packages/business/src/workspace-presence/service.ts`) — so a
   * report sent right as the LAST connection closes would report an empty
   * user list, which `onAlarm` already treats as "skip the POST entirely".
   * A report sent while OTHER connections remain open would not speed up
   * detecting the departed user's offline state either, since nothing in
   * that report can remove them from Redis; only the departed member's own
   * unrenewed TTL can. There is therefore no report content that would
   * make "offline" observably faster here, so none is sent — only the
   * alarm is stopped, promptly, rather than waiting for it to next fire
   * and silently no-op.
   *
   * Also clears {@link PRESENCE_LAST_ARMED_AT_STORAGE_KEY} in the same
   * case: leaving a recent timestamp behind would make the NEXT connect's
   * `ensureReportLoopArmed` see the loop as still "fresh" (even though the
   * alarm was just deleted) and skip re-arming — reintroducing exactly the
   * silent-forever-dark gap this design exists to prevent, just moved from
   * `getAlarm()` onto this key instead. Tearing the loop down must always
   * also reset the freshness marker that vouches for it being alive.
   */
  async onClose(connection: Party.Connection) {
    const remaining = [...this.room.getConnections()].filter(
      (candidate) => candidate.id !== connection.id,
    )
    if (remaining.length === 0) {
      await this.room.storage.deleteAlarm()
      await this.room.storage.delete(PRESENCE_LAST_ARMED_AT_STORAGE_KEY)
    }
  }

  /**
   * The third self-heal trigger, alongside `onConnect` and `onRequest`: a
   * QUIET room (open tab, no new connect, no broadcast) has neither of the
   * others, so a silently-stopped alarm would go unnoticed until presence
   * had already expired. See `PRESENCE_PING_MESSAGE_TYPE`.
   *
   * Validates the frame first — this socket carries no other client→server
   * message, so anything else is ignored rather than trusted as liveness. A
   * ping from a connection `onConnect` never tagged with a verified userId
   * is ignored too; only verified members may reach the arming path.
   *
   * No `seedUserId`: by now the connection is already tagged and visible to
   * `collectConnectedUserIds()`. Routed through the same serialized lock as
   * `onConnect`, so a ping storm causes at most one re-arm — and the
   * freshness gate makes every ping a no-op while the loop is healthy.
   */
  async onMessage(
    message: string | ArrayBuffer | ArrayBufferView,
    sender: Party.Connection,
  ) {
    if (typeof message !== "string") {
      return
    }

    const senderUserId = (sender.state as PresenceConnectionState | null)
      ?.userId
    if (!senderUserId) {
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(message)
    } catch {
      return
    }

    const result = presencePingMessageSchema.safeParse(parsed)
    if (!result.success) {
      return
    }

    await this.armReportLoopSerialized()
  }

  /**
   * Fires every {@link PRESENCE_REPORT_INTERVAL_MS} while the room has at
   * least one connection. Alarms have access to `room.storage` and
   * `room.getConnections()` but NOT `Party.id`/`room.context.parties`
   * (PartyKit's alarm restriction — see `onConnect`'s doc comment for why
   * the workspace id is read back from storage instead).
   *
   * Skips the POST entirely (and does not reschedule) when the room has no
   * connections — the loop simply stops; `onConnect` restarts it on the
   * next connection, and `onClose` above already stops it promptly rather
   * than waiting for this to notice.
   *
   * HIGH-1: whenever there IS at least one connection, the next alarm is
   * scheduled BEFORE awaiting the report POST — a fixed, latency-
   * independent cadence, so a slow (or entirely failed) report can never
   * delay, and never skip, the next one. Rescheduled unconditionally at
   * that point, even when the cached workspace id below turns out to be
   * missing from storage (a storage inconsistency must never silently stop
   * the loop — only an empty room may do that).
   */
  async onAlarm() {
    const userIds = this.collectConnectedUserIds()
    if (userIds.length === 0) {
      return
    }

    const now = Date.now()
    // Refreshes the SAME freshness marker `ensureReportLoopArmed` checks
    // (`PRESENCE_LAST_ARMED_AT_STORAGE_KEY`) — this is what keeps a
    // healthy loop looking "fresh" to every future connect/broadcast
    // forever, without either of them ever needing to re-derive it from
    // `getAlarm()` (see that key's doc comment for why not).
    await this.room.storage.put(PRESENCE_LAST_ARMED_AT_STORAGE_KEY, now)
    await this.room.storage.setAlarm(now + PRESENCE_REPORT_INTERVAL_MS)

    const workspaceId = await this.room.storage.get<string>(
      PRESENCE_WORKSPACE_ID_STORAGE_KEY,
    )
    if (workspaceId) {
      await reportWorkspacePresence(workspaceId, userIds)
    }
  }

  /** Distinct user ids across every currently-connected socket, read off
   * each connection's own state (set in `onConnect`) — never a second
   * verification, just the same tag-worthy identity already established. */
  private collectConnectedUserIds(): string[] {
    const userIds = new Set<string>()
    for (const connection of this.room.getConnections<PresenceConnectionState>()) {
      const userId = connection.state?.userId
      if (userId) {
        userIds.add(userId)
      }
    }
    return [...userIds]
  }

  /**
   * Handles both the existing workspace-wide broadcast (unchanged: parse,
   * re-serialize, `room.broadcast`) and two new privileged control paths
   * carried entirely via query params so the JSON body — and therefore the
   * wire format every existing event already relies on — never changes
   * shape:
   *   - `?action=revoke&userId=<id>` closes every tagged connection that
   *     member currently holds open in this room (membership removal).
   *   - `?userId=<id>` delivers the body to only that member's tagged
   *     connections via `room.getConnections(tag).send`, never
   *     `room.broadcast`.
   * Both remain gated by the same workspace-audience bearer token as the
   * existing broadcast path (`onBeforeRequest`/`verifyBroadcastRequest`).
   */
  async onRequest(req: Party.Request) {
    // Second, independent recovery path for a stalled report loop — see
    // `ensureReportLoopArmed`/`PRESENCE_LAST_ARMED_AT_STORAGE_KEY`. Any
    // workspace-wide broadcast/targeted-send/revoke request is a chance to
    // notice a room whose loop silently died without waiting for a new
    // connect, which may not happen again for hours if every tab stays
    // open. Best-effort and never allowed to block or fail the actual
    // request this call is for — a failure here is logged and swallowed,
    // exactly like `reportWorkspacePresence` itself already degrades.
    try {
      await this.ensureReportLoopArmed()
    } catch (error) {
      logger.error(
        { err: error, workspaceId: this.room.id },
        "workspace presence: failed to self-heal report loop from onRequest",
      )
    }

    const url = new URL(req.url)
    const action = url.searchParams.get(ACTION_QUERY_PARAM)
    const targetUserId = url.searchParams.get(TARGET_USER_QUERY_PARAM)

    if (action === REVOKE_ACTION) {
      if (!targetUserId) {
        return new Response("Bad Request", { status: 400 })
      }
      this.closeMemberConnections(targetUserId)
      return new Response("ok", { status: 200 })
    }

    const payload = await req.json()
    const message = JSON.stringify(payload)

    // A `userId` param that is PRESENT (even empty) means a targeted send; only
    // its ABSENCE (`null`) is a deliberate workspace-wide broadcast. An empty
    // string targets nobody — never fall back to broadcasting a targeted event
    // to the whole workspace.
    if (targetUserId !== null) {
      this.sendToMember(targetUserId, message)
      return new Response("ok", { status: 200 })
    }

    this.room.broadcast(message)
    return new Response("ok", { status: 200 })
  }

  private sendToMember(userId: string, message: string) {
    for (const connection of this.room.getConnections(
      toUserConnectionTag(userId),
    )) {
      connection.send(message)
    }
  }

  private closeMemberConnections(userId: string) {
    for (const connection of this.room.getConnections(
      toUserConnectionTag(userId),
    )) {
      connection.close(REVOKE_CLOSE_CODE, REVOKE_CLOSE_REASON)
    }
  }

  static async onBeforeRequest(
    req: Party.Request,
    // lobby: Party.Lobby,
    // ctx: Party.ExecutionContext
  ) {
    const error = await verifyBroadcastRequest(
      req,
      "workspace",
      env.REALTIME_BROADCAST_SECRET,
    )
    return error ?? req
  }

  /**
   * Verifies the short-lived (60s) connect token Builder minted for this member
   * (`signMemberConnectToken`). `verifyMemberConnectToken` rejects — via the
   * JWT `aud` check — a token whose `workspaceId` claim does not match this
   * room (`lobby.id`), which is the cross-room replay a stolen/misrouted
   * token would attempt; it also rejects a token missing the `userId`
   * claim. Either failure closes the upgrade with 401, never falling back to
   * trusting an unverified connection. The verified `userId` is threaded
   * through as a request header so `onConnect`/`getConnectionTags` above can
   * read it without re-verifying.
   */
  static async onBeforeConnect(req: Party.Request, lobby: Party.Lobby) {
    const token = new URL(req.url).searchParams.get("token")
    if (!token) {
      return new Response("Unauthorized", { status: 401 })
    }

    try {
      const { userId } = await verifyMemberConnectToken(
        token,
        lobby.id,
        env.REALTIME_BROADCAST_SECRET,
      )
      req.headers.set("X-User-ID", userId)
    } catch {
      return new Response("Unauthorized", { status: 401 })
    }

    return req
  }

  /**
   * Tags every connection with its verified member id (set on the request
   * headers by `onBeforeConnect` below), so targeted send and revocation can
   * look connections back up in O(connections-for-user) via
   * `room.getConnections(tag)` instead of scanning the whole room.
   */
  getConnectionTags(
    _connection: Party.Connection,
    { request }: Party.ConnectionContext,
  ): string[] {
    const userId = request.headers.get("X-User-ID")
    return userId ? [toUserConnectionTag(userId)] : []
  }
}
