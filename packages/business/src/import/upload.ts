import {
  fileContextTypes,
  type ImportType,
} from "@chatbotx.io/database/partials"
import { uploader } from "@chatbotx.io/filesystem"
import { getImportEntry, resolveImportFileFormat } from "@chatbotx.io/imports"
import { ChatbotXException } from "../errors"
import { fileService } from "../file/service"
import { resolveTenantSettings } from "../platform/settings"

const BYTES_PER_MB = 1024 * 1024

export type CreateImportUploadInput = {
  workspaceId: string
  /** `null` for a workspace-token caller, which has no session user. */
  userId: string | null
  type: ImportType
  fileName: string
  mimeType: string
  /** Declared size in bytes; checked against the import type's limit. */
  fileSize: number
}

export type ImportUpload = {
  fileId: string
  presignedPostUrl: string
  publicUrl: string
  path: string
}

/**
 * Validates the file against the import type's registry entry (MIME, extension,
 * format, size), records a pending `import` File row for the workspace and
 * returns a presigned PUT URL. The bytes are checked again while streaming
 * (`createByteLimitedStream`), so the declared size is an early rejection and
 * not the only guard.
 */
export async function createImportUpload(
  input: CreateImportUploadInput,
): Promise<ImportUpload> {
  const entry = getImportEntry(input.type)
  const { config } = entry

  if (!resolveImportFileFormat(config, input)) {
    throw new ChatbotXException(
      `Unsupported file type for a ${input.type} import: ${input.fileName} (${input.mimeType})`,
      "importUnsupportedFileType",
    )
  }
  if (input.fileSize > config.maxFileSizeMB * BYTES_PER_MB) {
    throw new ChatbotXException(
      `File exceeds the ${config.maxFileSizeMB} MB limit for ${input.type} imports`,
      "importFileTooLarge",
    )
  }

  const path = entry.handler.buildPath(
    { workspaceId: input.workspaceId, fileName: input.fileName },
    entry,
  )
  const [{ storageUrl }, presignedPostUrl] = await Promise.all([
    resolveTenantSettings({ workspaceId: input.workspaceId }),
    uploader.getPresignedUpload(path),
  ])

  const file = await fileService.createPending({
    workspaceId: input.workspaceId,
    userId: input.userId,
    contextType: fileContextTypes.enum.import,
    subType: input.type,
    path,
    fileName: input.fileName,
    mimeType: input.mimeType,
  })

  return {
    fileId: file.id,
    presignedPostUrl,
    publicUrl: new URL(path, storageUrl).toString(),
    path,
  }
}
