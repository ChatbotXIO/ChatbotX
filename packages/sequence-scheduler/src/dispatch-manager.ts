import { db, type Transaction } from "@chatbotx.io/database/client"
import { sequenceDispatchModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { createHash } from "crypto"

/**
 * The dispatch *creation* path. It hashes with Node's `crypto` to pick a bucket,
 * so this module can only run in a Node process. Cancellation deliberately lives
 * in `./dispatch-cancel` — it needs no hashing, and Edge-Runtime consumers import
 * it directly instead of paying for `crypto` here.
 */

type DrizzleClient = typeof db | Transaction

export function calculateBucket(
  workspaceId: string,
  contactId: string,
): number {
  const key = `${workspaceId}:${contactId}`
  const hash = createHash("sha256").update(key).digest()
  return hash[0] // First byte gives 0-255
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
