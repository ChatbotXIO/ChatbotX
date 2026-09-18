import type Redis from "ioredis"

/**
 * Atomic Lua script: marks members live until now+ttlMs, refreshes the key's
 * TTL, prunes expired members first — one round-trip regardless of batch size.
 * Returns members not already live before this write (checked after pruning),
 * so heartbeatMany can flag offline->online transitions without a second call.
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
 * Generic ephemeral presence set: a member heartbeating within a TTL window
 * counts as live and drops out on its own — no sweeper needed. Backed by a
 * sorted set scored by expiry, pruned on read. Channel-agnostic: knows nothing
 * about calls/agents/workspaces.
 */
export const presenceStoreFactory = (getRedisClient: () => Promise<Redis>) => ({
  /**
   * Marks every id in members live under key, in one round-trip regardless of
   * batch size. No-op returning { newlyLiveMembers: [] } when members is empty.
   * newlyLiveMembers is the subset with no unexpired entry before this call —
   * an offline -> online transition, not a renewal.
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
   * Live members under key (expiry still in the future), most-recently-seen
   * first, capped at limit. Self-cleaning: drops already-expired members before
   * reading, so the result never includes a stale entry.
   */
  async liveMembers(key: string, limit: number): Promise<string[]> {
    const redis = await getRedisClient()
    const now = Date.now()
    await redis.zremrangebyscore(key, 0, now)
    return await redis.zrevrangebyscore(key, "+inf", now, "LIMIT", 0, limit)
  },
})

export type PresenceStore = ReturnType<typeof presenceStoreFactory>
