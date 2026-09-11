import {
  type FileContextType,
  fileStatuses,
} from "@chatbotx.io/database/partials"
import { fileRepository } from "@chatbotx.io/database/repositories"
import type { FileModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"

type CreatePendingInput = {
  workspaceId?: string | null
  userId: string
  contextType: FileContextType
  /**
   * Free-text discriminator (`File.subType` is a plain text column). It carries
   * a wider set than `uploadTypes` — the import sub-types and `"file"` also land
   * here — so it is not narrowed to an enum.
   */
  subType?: string | null
  path: string
  fileName: string
  mimeType: string
}

class FileService extends BaseService {
  /**
   * Records a presigned upload before the bytes land. The row starts `pending`
   * and is promoted once the client confirms the upload, so an abandoned
   * presign leaves a row the cleanup can find rather than an orphan S3 object.
   *
   * The caller owns authorization and path derivation — `path` must already
   * come from an upload handler, never straight from the request body.
   */
  async createPending(input: CreatePendingInput): Promise<FileModel> {
    return await fileRepository.create({
      id: createId(),
      workspaceId: input.workspaceId ?? null,
      userId: input.userId,
      contextType: input.contextType,
      subType: input.subType,
      path: input.path,
      fileName: input.fileName,
      mimeType: input.mimeType,
      status: fileStatuses.enum.pending,
    })
  }
}

export const fileService = new FileService()
