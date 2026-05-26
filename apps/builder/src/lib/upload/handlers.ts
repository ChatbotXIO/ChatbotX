import {
  type ImportType,
  type UploadTypes,
  uploadTypes,
} from "@chatbotx.io/database/partials"
import { getImportEntry } from "@chatbotx.io/imports"

export type UploadHandlerInput = {
  workspaceId: string
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
    path: entry.handler.buildPath(input, entry),
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
  if (!input.path.startsWith(`workspaces/${input.workspaceId}/`)) {
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
