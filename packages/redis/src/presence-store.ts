import type Redis from "ioredis"

/**
 * Marks every member in ARGV[3..] live in the sorted set at KEYS[1] until
 * `now + ttlMs`, refreshing the whole key's TTL, and prunes every
 * already-expired member first — all in ONE atomic script covering the
 * whole batch (one Redis round-trip regardless of how many members are in
 * it). Reports which of those members were NOT already live immediately
 * before this write (checked AFTER pruning, so an expired member counts as
 * "newly live" same as a never-seen one) — e.g.
 * `workspacePresenceService.heartbeatMany` uses this to decide which users
 * need a durable "went online" write, without a second round-trip.
 */
const PRESENCE_HEARTBEAT_MANY_LUA = `
local presenceKey = KEYS[1]
local ttlMs = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local expiresAt = now + ttlMs

redis.call('ZREMRANGEBYSCORE', presenceKey, 0, now)

local newlyLive = {}
for i = 3, #ARGV do
  local member = ARGV[i]
  local previousScore = redis.call('ZSCORE', presenceKey, member)
  if not previousScore then
    table.insert(newlyLive, member)
  end
  redis.call('ZADD', presenceKey, expiresAt, member)
end

redis.call('PEXPIRE', presenceKey, ttlMs)

return newlyLive
`

type PresenceCommandsClient = Redis & {
  presenceHeartbeatMany: (
    presenceKey: string,
    ttlMs: string,
    now: string,
    ...members: string[]
  ) => Promise<string[]>
}

const clientsWithPresenceCommands = new WeakSet<Redis>()

function withPresenceCommands(client: Redis): PresenceCommandsClient {
  if (!clientsWithPresenceCommands.has(client)) {
    client.defineCommand("presenceHeartbeatMany", {
      numberOfKeys: 1,
      lua: PRESENCE_HEARTBEAT_MANY_LUA,
    })
    clientsWithPresenceCommands.add(client)
  }
  return client as PresenceCommandsClient
}

/**
 * Generic ephemeral presence set: a member that "heartbeats" within a TTL
 * window counts as live, and drops out on its own once it stops — no sweeper
 * needed. Backed by a Redis sorted set scored by each member's expiry (epoch
 * ms); a read prunes the expired members in the same round-trip, so a crashed
 * or closed client never lingers. Channel-agnostic in the same factory style
 * as {@link import("./cas-store").casStoreFactory}: it knows nothing about
 * calls/agents/workspaces, only `key -> { member, expiresAt }`.
 */
export const presenceStoreFactory = (getRedisClient: () => Promise<Redis>) => ({
  /**
   * Marks every id in `members` live under `key` until `now + ttlMs`, in ONE
   * Redis round-trip (one Lua script doing the prune + every `ZADD` +
   * `PEXPIRE`) regardless of batch size — the batched equivalent of calling
   * a single-member heartbeat once per id, which is what makes this safe to
   * call at "every online user in a workspace" scale (e.g. the realtime
   * server's periodic presence report, `workspacePresenceService.
   * heartbeatMany`). A no-op returning `{ newlyLiveMembers: [] }` when
   * `members` is empty — no Redis call at all.
   *
   * Returns `newlyLiveMembers`: the subset of `members` that had NO
   * unexpired entry immediately before this call (i.e. their heartbeat is
   * the first live one — an offline -> online transition — rather than a
   * renewal).
   */
  async heartbeatMany(
    key: string,
    members: string[],
    ttlMs: number,
  ): Promise<{ newlyLiveMembers: string[] }> {
    if (members.length === 0) {
      return { newlyLiveMembers: [] }
    }
    const redis = withPresenceCommands(await getRedisClient())
    const now = Date.now()
    const newlyLiveMembers = await redis.presenceHeartbeatMany(
      key,
      String(ttlMs),
      String(now),
      ...members,
    )
    return { newlyLiveMembers }
  },

  /**
   * Live members under `key` (expiry still in the future), most-recently-seen
   * first, capped at `limit`. Self-cleaning: it drops the already-expired
   * members before reading, so the returned set never includes a stale entry.
   */
  async liveMembers(key: string, limit: number): Promise<string[]> {
    const redis = await getRedisClient()
    const now = Date.now()
    await redis.zremrangebyscore(key, 0, now)
    return await redis.zrevrangebyscore(key, "+inf", now, "LIMIT", 0, limit)
  },
})

export type PresenceStore = ReturnType<typeof presenceStoreFactory>
