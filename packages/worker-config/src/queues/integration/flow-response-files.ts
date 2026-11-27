import type { StoredFlowResponseFile } from "@chatbotx.io/sdk"

/**
 * A kept file of a form (Flow) answer with its public URL, as the jobs that
 * apply a form response carry it to whatever consumes the answer (custom
 * fields). Resolved once, when the job is enqueued, from the attachments the
 * message's ingestion produced.
 */
export type ResolvedFlowFile = Omit<StoredFlowResponseFile, "status"> & {
  url: string
}
