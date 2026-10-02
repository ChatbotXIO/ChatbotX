import { z } from "zod"
import { realtimeEventEnvelopeSchema } from "./schemas"

export const REALTIME_STREAM_SHARD_COUNT = 256

const hashWorkspaceId = (workspaceId: string): number => {
  let hash = 0
  for (let index = 0; index < workspaceId.length; index += 1) {
    hash = (hash * 31 + workspaceId.charCodeAt(index)) % 4_294_967_296
  }
  return hash
}

export const getRealtimeStreamShard = (workspaceId: string): number =>
  hashWorkspaceId(workspaceId) % REALTIME_STREAM_SHARD_COUNT

/**
 * Redis cluster hash tags keep every append and consumer read for a shard on
 * one hash slot while preserving the stable workspace-to-shard assignment.
 */
export const getRealtimeStreamKey = (workspaceId: string): string =>
  `rt:{${getRealtimeStreamShard(workspaceId)}}`

/**
 * Redis Stream id ordering (`<ms>-<sequence>`). `true` when `candidate` is
 * strictly newer than `previous`.
 */
export const isRealtimeSeqAfter = (
  candidate: string,
  previous: string,
): boolean => {
  const [candidateMilliseconds, candidateSequence] = candidate
    .split("-")
    .map(BigInt)
  const [previousMilliseconds, previousSequence] = previous
    .split("-")
    .map(BigInt)
  return (
    candidateMilliseconds > previousMilliseconds ||
    (candidateMilliseconds === previousMilliseconds &&
      candidateSequence > previousSequence)
  )
}

const realtimeWorkspaceEventsStreamRecordSchema = z.object({
  events: z.array(realtimeEventEnvelopeSchema).min(1),
  kind: z.literal("workspace-events"),
  workspaceId: z.string().min(1),
})

const realtimeGuestEventStreamRecordSchema = z.object({
  event: realtimeEventEnvelopeSchema,
  guestConversationId: z.string().min(1),
  kind: z.literal("guest-event"),
  workspaceId: z.string().min(1),
})

const realtimeMemberSendStreamRecordSchema = z.object({
  event: realtimeEventEnvelopeSchema,
  kind: z.literal("member-send"),
  userId: z.string().min(1),
  workspaceId: z.string().min(1),
})

const realtimeMemberRevokeStreamRecordSchema = z.object({
  kind: z.literal("member-revoke"),
  userId: z.string().min(1),
  workspaceId: z.string().min(1),
})

/**
 * A Redis Stream record has exactly one delivery route. Workspace batches are
 * coalesced before publishing; guest and member-control records retain their
 * individual semantics.
 */
export const realtimeStreamRecordSchema = z.discriminatedUnion("kind", [
  realtimeWorkspaceEventsStreamRecordSchema,
  realtimeGuestEventStreamRecordSchema,
  realtimeMemberSendStreamRecordSchema,
  realtimeMemberRevokeStreamRecordSchema,
])
export type RealtimeStreamRecord = z.infer<typeof realtimeStreamRecordSchema>
