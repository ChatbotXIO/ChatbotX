import type { AudienceUploadResult } from "@chatbotx.io/business/facebook-marketing-message-audience"

/**
 * What the upload actions return. Anything that THROWS (transport failure,
 * unmapped server error) is, by construction, an outcome we cannot classify.
 */
export type UploadOutcome =
  | ({ status: "ok" } & AudienceUploadResult)
  // An audience exists on Meta but the upload did not finish.
  | { status: "partial"; received: number; message: string }
  // Rejected before anything was created (bad file, ToS, Page, ...).
  | { status: "invalid"; message: string }

export type UploadFeedback =
  | { kind: "success"; result: AudienceUploadResult }
  | {
      kind: "failed"
      message: string
      /** Create mode only: a retry could create a second Meta audience. */
      lockUpload: boolean
    }

/**
 * Maps an action outcome (or a thrown error, when `outcome` is undefined) to
 * what the wizard shows and whether Upload stays enabled. In create mode an
 * unclassifiable failure locks Upload: we cannot know whether Meta created the
 * audience, and a blind retry would create another.
 */
export function resolveUploadFeedback({
  mode,
  outcome,
  thrownMessage,
  uncertainMessage,
}: {
  mode: "create" | "append"
  outcome: UploadOutcome | undefined
  thrownMessage?: string
  uncertainMessage: string
}): UploadFeedback {
  if (outcome?.status === "ok") {
    const { status: _status, ...result } = outcome
    return { kind: "success", result }
  }
  const create = mode === "create"
  if (outcome?.status === "partial") {
    return { kind: "failed", message: outcome.message, lockUpload: create }
  }
  if (outcome?.status === "invalid") {
    return { kind: "failed", message: outcome.message, lockUpload: false }
  }
  return {
    kind: "failed",
    message: create ? uncertainMessage : (thrownMessage ?? uncertainMessage),
    lockUpload: create,
  }
}
