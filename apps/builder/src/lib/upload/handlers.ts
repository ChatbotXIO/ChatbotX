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

  if (input.workspaceId) {
    const isValidPath =
      input.path.startsWith(`workspaces/${input.workspaceId}/`) ||
      input.path.startsWith(`public/space/${input.workspaceId}/`)
    if (!isValidPath) {
      return { ok: false, error: "Invalid path", status: 400 }
    }
  } else if (input.userId) {
    return { ok: true, path: `public/platform/${input.userId}/${input.path}` }
  } else {
    return { ok: false, error: "Invalid path", status: 400 }
  }

  return { ok: true, path: input.path }
}

const uploadHandlers: Record<UploadTypes, UploadHandler> = {
  [uploadTypes.enum.import]: importHandler,
  [uploadTypes.enum.generic]: genericHandler,
}

export const getUploadHandler = (type: UploadTypes): UploadHandler =>
  uploadHandlers[type]
