import { db, type Transaction } from "@chatbotx.io/database/client"
import { sequenceDispatchModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"

/**
 * The dispatch *creation* path. Bucketing uses a small pure-JS string hash
 * instead of Node's `crypto`, so nothing here imports a Node built-in: the
 * builder pulls `@chatbotx.io/business` — and this module, transitively — into
 * the Edge Runtime, where a `crypto` import fails to compile. Creation still
 * lives apart from `./dispatch-cancel` by responsibility (creating vs.
 * cancelling a dispatch), no longer because of `crypto`.
 */

type DrizzleClient = typeof db | Transaction

/**
 * Maps a contact to one of 256 dispatch buckets for parallel worker scanning.
 * The value is computed once at creation and persisted on the dispatch row;
 * nothing ever recomputes it (cancel/scan read `bucket` back from the row), so
 * the hash only needs to be deterministic and spread evenly across 0–255 — it
 * is not security-sensitive.
 */
export function calculateBucket(
  workspaceId: string,
  contactId: string,
): number {
  const key = `${workspaceId}:${contactId}`
  // Polynomial string hash (base 31), reduced each step by a 31-bit Mersenne
  // prime so it never leaves JS safe-integer range and needs no bitwise ops.
  // `% 256` then spreads evenly across the 256 buckets.
  let hash = 0
  for (let index = 0; index < key.length; index++) {
    hash = (hash * 31 + key.charCodeAt(index)) % 2_147_483_647
  }
  return hash % 256
}

export function generateIdempotencyKey(
  workspaceId: string,
  enrollmentId: string,
  stepId: string,
  runAt: Date,
): string {
  return `${workspaceId}:${enrollmentId}:${stepId}:${runAt.toISOString()}`
}
export interface CreateDispatchParams {
  client?: DrizzleClient
  contactId: string
  contactInboxId: string
  enrollmentId: string
  runAt: Date
  sequenceId: string
  stepId: string
  workspaceId: string
}
export async function createDispatch(
  params: CreateDispatchParams,
): Promise<{ id: string; bucket: number; runAtMs: string }> {
  const {
    workspaceId,
    sequenceId,
    contactId,
    contactInboxId,
    stepId,
    enrollmentId,
    runAt,
    client,
  } = params
  const bucket = calculateBucket(workspaceId, contactId)
  const runAtMs = String(runAt.getTime())
  const dispatchId = createId()
  const idempotencyKey = generateIdempotencyKey(
    workspaceId,
    enrollmentId,
    stepId,
    runAt,
  )

  const insertDispatch = async (tx: DrizzleClient) => {
    const [dispatch] = await tx
      .insert(sequenceDispatchModel)
      .values({
        id: dispatchId,
        workspaceId,
        sequenceId,
        contactId,
        contactInboxId,
        stepId,
        enrollmentId,
        runAtMs,
        bucket,
        idempotencyKey,
        status: "pending",
        attempt: 0,
      })
      .returning({
        id: sequenceDispatchModel.id,
        bucket: sequenceDispatchModel.bucket,
        runAtMs: sequenceDispatchModel.runAtMs,
      })

    if (!dispatch) {
      throw new Error("Failed to create dispatch")
    }

    return dispatch
  }

  if (client) {
    return await insertDispatch(client)
  }

  return await insertDispatch(db)
}
