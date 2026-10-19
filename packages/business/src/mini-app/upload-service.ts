import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isNull,
} from "@chatbotx.io/database/client"
import { miniAppUploadModel } from "@chatbotx.io/database/schema"
import type { MiniAppModel } from "@chatbotx.io/database/types"
import { uploader } from "@chatbotx.io/filesystem"
import {
  buildUploadPath,
  MINI_APP_UPLOAD_SNIFF_BYTES,
  type MiniAppFileAnswer,
  type MiniAppUploadRejection,
  resolveUploadRules,
  sanitizeFileName,
  verifyUpload,
} from "@chatbotx.io/mini-app"
import { createId, getPublicFileUrl } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { ChatbotXException, validationException } from "../errors"
import { resolveTenantSettings } from "../platform/settings"
import { findVisitorContactId } from "./visitor-contact"

const MAX_ORIGINAL_NAME_LENGTH = 200

/**
 * 16 random bytes, base64url (22 chars): unguessable, unlike snowflake ids.
 * Web Crypto + `btoa` rather than `node:crypto`, because this module is also
 * traced into the Edge instrumentation bundle (via the builder's oRPC router).
 */
const randomToken = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")

export type MiniAppUploadErrorCode = MiniAppUploadRejection | "unknown_input"

/** A rejected upload; `code` lets the public route answer with a precise message. */
export class MiniAppUploadError extends ChatbotXException {
  readonly reason: MiniAppUploadErrorCode

  constructor(reason: MiniAppUploadErrorCode) {
    super(
      `Upload rejected: ${reason}`,
      "miniAppUploadRejected",
      reason === "too_large" ? 413 : 422,
    )
    this.reason = reason
  }
}

export interface MiniAppUploadResult {
  mimeType: string
  name: string
  size: number
  uploadId: string
  url: string
}

const publicUrl = async (workspaceId: string, path: string) => {
  const { storageUrl } = await resolveTenantSettings({ workspaceId })
  return getPublicFileUrl(path, storageUrl)
}

type UploadedFile = {
  name: string
  type: string
  size: number
  bytes: Uint8Array
}

type UploadingMiniApp = Pick<MiniAppModel, "id" | "workspaceId" | "definition">

/** The file's verified MIME type; throws when the input's rules refuse it. */
const verifyFile = (
  miniApp: UploadingMiniApp,
  inputName: string,
  file: UploadedFile,
): string => {
  const rules = resolveUploadRules(miniApp.definition, inputName)
  if (!rules) {
    throw new MiniAppUploadError("unknown_input")
  }
  const verdict = verifyUpload({
    rules,
    size: file.size,
    head: file.bytes.subarray(0, MINI_APP_UPLOAD_SNIFF_BYTES),
    declaredMimeType: file.type,
  })
  if (!verdict.ok) {
    throw new MiniAppUploadError(verdict.reason)
  }
  return verdict.mimeType
}

/** Puts the file in public storage; returns its storage path. */
const storeObject = async (input: {
  miniApp: UploadingMiniApp
  contactId: string | null
  file: UploadedFile
  mimeType: string
}): Promise<string> => {
  const fileName = sanitizeFileName(input.file.name)
  const path = buildUploadPath({
    workspaceId: input.miniApp.workspaceId,
    miniAppId: input.miniApp.id,
    contactId: input.contactId,
    randomKey: randomToken(),
    fileName,
  })
  const isImage = input.mimeType.startsWith("image/")
  await uploader.putObject(path, input.file.bytes, {
    ACL: "public-read",
    ContentType: input.mimeType,
    ContentLength: input.file.size,
    // Documents download rather than open inline from the public URL.
    ...(isImage
      ? {}
      : { ContentDisposition: `attachment; filename="${fileName}"` }),
  })
  return path
}

class MiniAppUploadService extends BaseService {
  /**
   * Stores one file a visitor picked in a PhotoPicker / DocumentPicker. The
   * file stays `pending` until the visitor submits the Mini App; the returned
   * `uploadId` is what the submit carries.
   */
  async create(input: {
    miniApp: UploadingMiniApp
    contactId: string | null
    inputName: string
    file: UploadedFile
  }): Promise<MiniAppUploadResult> {
    const { miniApp, file } = input
    const mimeType = verifyFile(miniApp, input.inputName, file)
    const contactId = await findVisitorContactId({
      workspaceId: miniApp.workspaceId,
      contactId: input.contactId,
    })
    const path = await storeObject({ miniApp, contactId, file, mimeType })
    const uploadToken = randomToken()
    const originalName =
      file.name.slice(0, MAX_ORIGINAL_NAME_LENGTH) ||
      sanitizeFileName(file.name)
    await db.insert(miniAppUploadModel).values({
      id: createId(),
      workspaceId: miniApp.workspaceId,
      miniAppId: miniApp.id,
      contactId,
      submissionId: null,
      inputName: input.inputName,
      uploadToken,
      path,
      fileName: originalName,
      mimeType,
      size: file.size,
      status: "pending",
    })
    return {
      uploadId: uploadToken,
      name: originalName,
      size: file.size,
      mimeType,
      url: await publicUrl(miniApp.workspaceId, path),
    }
  }

  /**
   * Swaps the upload ids a submit carries for the files themselves and marks
   * them submitted. Every id must be a pending upload of this Mini App, this
   * input and this visitor (same contact, or both anonymous), within the
   * input's file count.
   */
  async claimForSubmission(input: {
    tx: DatabaseClient
    miniApp: UploadingMiniApp
    contactId: string | null
    submissionId: string
    inputName: string
    uploadIds: string[]
  }): Promise<MiniAppFileAnswer[]> {
    const rules = resolveUploadRules(input.miniApp.definition, input.inputName)
    const uniqueIds = [...new Set(input.uploadIds)]
    if (!rules || uniqueIds.length > rules.maxFiles) {
      throw validationException("answers", "Invalid uploads")
    }
    const rows = await input.tx
      .select()
      .from(miniAppUploadModel)
      .where(
        and(
          eq(miniAppUploadModel.miniAppId, input.miniApp.id),
          eq(miniAppUploadModel.inputName, input.inputName),
          eq(miniAppUploadModel.status, "pending"),
          inArray(miniAppUploadModel.uploadToken, uniqueIds),
          input.contactId
            ? eq(miniAppUploadModel.contactId, input.contactId)
            : isNull(miniAppUploadModel.contactId),
        ),
      )
    if (rows.length !== uniqueIds.length) {
      throw validationException("answers", "Invalid uploads")
    }
    await input.tx
      .update(miniAppUploadModel)
      .set({ status: "submitted", submissionId: input.submissionId })
      .where(
        inArray(
          miniAppUploadModel.id,
          rows.map((row) => row.id),
        ),
      )
    const { storageUrl } = await resolveTenantSettings({
      workspaceId: input.miniApp.workspaceId,
      tx: input.tx,
    })
    const byToken = new Map(rows.map((row) => [row.uploadToken, row]))
    return uniqueIds.flatMap((uploadId) => {
      const row = byToken.get(uploadId)
      return row
        ? [
            {
              uploadId,
              url: getPublicFileUrl(row.path, storageUrl),
              name: row.fileName,
              mimeType: row.mimeType,
              size: row.size,
            },
          ]
        : []
    })
  }
}

export const miniAppUploadService = new MiniAppUploadService()
