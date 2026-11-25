import { isTruncatedExport } from "./posts-list-input"

const FILE_NAME_PATTERN = /filename="([^"]+)"/
const FALLBACK_FILE_NAME = "post-comments.csv"
const QUOTA_EXCEEDED_STATUS = 429
const QUOTA_EXCEEDED_CODE = "postMessageQuotaExceeded"
const WORKSPACE_BLOCKED_STATUS = 402

/** Browsers read the object URL after `click()` returns; revoking at once cancels the download in Safari and Firefox. */
const REVOKE_DELAY_MS = 1000

export type ExportDownloadOutcome =
  | { status: "saved"; truncated: boolean }
  | { status: "quotaExceeded" }
  | { status: "workspaceBlocked" }
  | { status: "failed" }

/** A download that saved nothing, by why. */
export type ExportDownloadFailure = Exclude<
  ExportDownloadOutcome,
  { status: "saved" }
>["status"]

/** The translated toast of each failed download, shared by every export button. */
export const EXPORT_FAILURE_MESSAGE_KEYS = {
  failed: "posts.export.failed",
  quotaExceeded: "posts.export.quotaExceeded",
  workspaceBlocked: "posts.export.blocked",
} as const satisfies Record<ExportDownloadFailure, string>

const fileNameOf = (response: Response): string =>
  FILE_NAME_PATTERN.exec(
    response.headers.get("Content-Disposition") ?? "",
  )?.[1] ?? FALLBACK_FILE_NAME

const saveBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}

/** A 429 is the message quota only when the body says so; any other 429 is a plain failure. */
const isQuotaExceededBody = async (response: Response): Promise<boolean> => {
  try {
    const body: unknown = await response.json()
    return (
      typeof body === "object" &&
      body !== null &&
      "code" in body &&
      body.code === QUOTA_EXCEEDED_CODE
    )
  } catch {
    return false
  }
}

/**
 * Fetches an export route and saves the file. The route answers 429 when the
 * account has no message left (a download consumes one) and 402 when the
 * workspace's plan or trial has expired; both are reported on their own so the
 * caller can say so instead of a generic failure.
 */
export const downloadPostsExport = async (
  url: string,
): Promise<ExportDownloadOutcome> => {
  try {
    const response = await fetch(url)
    if (response.status === QUOTA_EXCEEDED_STATUS) {
      return (await isQuotaExceededBody(response))
        ? { status: "quotaExceeded" }
        : { status: "failed" }
    }
    if (response.status === WORKSPACE_BLOCKED_STATUS) {
      return { status: "workspaceBlocked" }
    }
    if (!response.ok) {
      return { status: "failed" }
    }
    saveBlob(await response.blob(), fileNameOf(response))
    return { status: "saved", truncated: isTruncatedExport(response.headers) }
  } catch {
    return { status: "failed" }
  }
}
