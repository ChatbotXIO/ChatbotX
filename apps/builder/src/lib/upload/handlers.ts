import {
  type ImportType,
  type UploadTypes,
  uploadTypes,
} from "@chatbotx.io/database/partials"
import { getImportEntry } from "@chatbotx.io/imports"

export type UploadHandlerInput = {
  workspaceId?: string
  userId?: string
  fileName: string
  mimeType: string
  subType: string
  path?: string
}

export type UploadHandlerResult =
  | { ok: true; path: string }
  | { ok: false; error: string; status: number }

export type UploadHandler = (input: UploadHandlerInput) => UploadHandlerResult

/**
 * Path segments that belong to a super-admin-gated upload type and must NEVER
 * be writable through the generic (membership-only) handler — otherwise a
 * member could stage an object in a privileged namespace with `type: "generic"`
 * and skip the per-type super-admin gate in `route.ts`. Keep in sync with the
 * dedicated handlers below and `buildMessagingAdCreativeStoragePrefix`.
 */
const PRIVILEGED_PATH_SEGMENTS = ["/ads-campaign/creatives/"] as const

/** Percent-encoded path separators (`%2F`/`%5C`) S3 may decode into a real `/`. */
const ENCODED_PATH_SEPARATOR = /%2f|%5c/i

const importHandler: UploadHandler = (input) => {
  if (!input.workspaceId) {
    return {
      ok: false,
      error: "workspaceId is required for import",
      status: 400,
    }
  }

  const entry = getImportEntry(input.subType as ImportType)

  if (!entry.config.acceptedMimeTypes.includes(input.mimeType)) {
    return {
      ok: false,
      error: `Unsupported MIME type: ${input.mimeType}`,
      status: 400,
    }
  }

  return {
    ok: true,
    path: entry.handler.buildPath(
      { ...input, workspaceId: input.workspaceId },
      entry,
    ),
  }
}

const genericHandler: UploadHandler = (input) => {
  if (!input.path) {
    return {
      ok: false,
      error: "Path is required for generic upload",
      status: 400,
    }
  }

  // Defense in depth against an encoded-separator slip into a privileged
  // namespace (the schema also rejects this). S3 may decode `%2F`/`%5C`, so a
  // literal `includes` check below would otherwise miss it.
  if (ENCODED_PATH_SEPARATOR.test(input.path)) {
    return { ok: false, error: "Invalid path", status: 400 }
  }

  if (input.workspaceId) {
    const isValidPath =
      input.path.startsWith(`workspaces/${input.workspaceId}/`) ||
      input.path.startsWith(`public/space/${input.workspaceId}/`)
    if (!isValidPath) {
      return { ok: false, error: "Invalid path", status: 400 }
    }
    // A privileged sub-namespace (e.g. ads-creative) is only writable through
    // its own super-admin-gated type — never via the generic path. Compare
    // case-insensitively so a differently-cased path can't dodge the block.
    const lowerPath = input.path.toLowerCase()
    if (
      PRIVILEGED_PATH_SEGMENTS.some((segment) => lowerPath.includes(segment))
    ) {
      return { ok: false, error: "Invalid path", status: 400 }
    }
  } else if (input.userId) {
    return { ok: true, path: `public/platform/${input.userId}/${input.path}` }
  } else {
    return { ok: false, error: "Invalid path", status: 400 }
  }

  return { ok: true, path: input.path }
}

/**
 * Messaging-ad creative image upload — workspace-scoped to the ONE
 * `ads-campaign/creatives` prefix (never the general `workspaces/…`/
 * `public/space/…` namespace `genericHandler` allows), and gated to
 * super-admin in `route.ts` (mirrors the pre-presigned-upload `uploadAdImage`
 * oRPC's `assertWorkspaceSuperAdmin`, which `/api/presigned-upload`'s default
 * membership-only auth does not otherwise provide). Keep the path prefix in
 * sync with `buildMessagingAdCreativeStoragePrefix`
 * (`@chatbotx.io/integration-facebook-ads`).
 */
const adsCampaignCreativeHandler: UploadHandler = (input) => {
  if (!(input.path && input.workspaceId)) {
    return {
      ok: false,
      error: "workspaceId and path are required for an ads-creative upload",
      status: 400,
    }
  }
  const isValidPath = input.path.startsWith(
    `public/space/${input.workspaceId}/ads-campaign/creatives/`,
  )
  if (!isValidPath) {
    return { ok: false, error: "Invalid path", status: 400 }
  }
  return { ok: true, path: input.path }
}

const uploadHandlers: Record<UploadTypes, UploadHandler> = {
  [uploadTypes.enum.import]: importHandler,
  [uploadTypes.enum.generic]: genericHandler,
  [uploadTypes.enum.adsCampaignCreative]: adsCampaignCreativeHandler,
}

export const getUploadHandler = (type: UploadTypes): UploadHandler =>
  uploadHandlers[type]
