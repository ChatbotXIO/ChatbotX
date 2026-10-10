import { randomBytes } from "node:crypto"
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
import { contactService } from "../contact/service"
import { ChatbotXException, validationException } from "../errors"
import { resolveTenantSettings } from "../platform/settings"

const MAX_ORIGINAL_NAME_LENGTH = 200

/** 16 random bytes, base64url (22 chars): unguessable, unlike snowflake ids. */
const randomToken = () => randomBytes(16).toString("base64url")

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

class MiniAppUploadService extends BaseService {
  /**
   * Stores one file a visitor picked in a PhotoPicker / DocumentPicker. The
   * file stays `pending` until the visitor submits the Mini App; the returned
   * `uploadId` is what the submit carries.
   */
  async create(input: {
    miniApp: Pick<MiniAppModel, "id" | "workspaceId" | "definition">
    contactId: string | null
    inputName: string
    file: { name: string; type: string; size: number; bytes: Uint8Array }
  }): Promise<MiniAppUploadResult> {
    const rules = resolveUploadRules(input.miniApp.definition, input.inputName)
    if (!rules) {
      throw new MiniAppUploadError("unknown_input")
    }
    const verdict = verifyUpload({
      rules,
      size: input.file.size,
      head: input.file.bytes.subarray(0, MINI_APP_UPLOAD_SNIFF_BYTES),
      declaredMimeType: input.file.type,
    })
    if (!verdict.ok) {
      throw new MiniAppUploadError(verdict.reason)
    }

    // The token may outlive the contact; a deleted contact uploads anonymously.
    const contact = input.contactId
      ? await contactService.findById({
          workspaceId: input.miniApp.workspaceId,
          id: input.contactId,
        })
      : undefined
    const contactId = contact?.id ?? null
    const fileName = sanitizeFileName(input.file.name)
    const path = buildUploadPath({
      workspaceId: input.miniApp.workspaceId,
      miniAppId: input.miniApp.id,
      contactId,
      randomKey: randomToken(),
      fileName,
    })
    const isImage = verdict.mimeType.startsWith("image/")
    await uploader.putObject(path, input.file.bytes, {
      ACL: "public-read",
      ContentType: verdict.mimeType,
      ContentLength: input.file.size,
      // Documents download rather than open inline from the public URL.
      ...(isImage
        ? {}
        : { ContentDisposition: `attachment; filename="${fileName}"` }),
    })

    const uploadToken = randomToken()
    const originalName =
      input.file.name.slice(0, MAX_ORIGINAL_NAME_LENGTH) || fileName
    await db.insert(miniAppUploadModel).values({
      id: createId(),
      workspaceId: input.miniApp.workspaceId,
      miniAppId: input.miniApp.id,
      contactId,
      submissionId: null,
      inputName: input.inputName,
      uploadToken,
      path,
      fileName: originalName,
      mimeType: verdict.mimeType,
      size: input.file.size,
      status: "pending",
    })

    return {
      uploadId: uploadToken,
      name: originalName,
      size: input.file.size,
      mimeType: verdict.mimeType,
      url: await publicUrl(input.miniApp.workspaceId, path),
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
    miniApp: Pick<MiniAppModel, "id" | "workspaceId" | "definition">
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
