import { verifyMemberConnectToken } from "@chatbotx.io/partysocket-config/auth"
import type * as Party from "partykit/server"
import { env } from "../env"
import { toUserConnectionTag } from "../lib/connection-tags"
import { verifyBroadcastRequest } from "../lib/realtime-auth"

const REVOKE_ACTION = "revoke"
const TARGET_USER_QUERY_PARAM = "userId"
const ACTION_QUERY_PARAM = "action"
const REVOKE_CLOSE_CODE = 4001
const REVOKE_CLOSE_REASON = "Revoked"

export default class WorkspaceParty implements Party.Server {
  // biome-ignore lint/style/noParameterProperties: wip
  constructor(readonly room: Party.Room) {}

  onConnect(
    connection: Party.Connection,
    { request }: Party.ConnectionContext,
  ) {
    const userId = request.headers.get("X-User-ID")
    if (!userId) {
      return connection.close(1008, "Unauthorized")
    }
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
   * Verifies the one-time connect token Builder minted for this member
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
}
