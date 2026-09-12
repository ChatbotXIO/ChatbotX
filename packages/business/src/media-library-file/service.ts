import { mediaLibraryFileRepository } from "@chatbotx.io/database/repositories"
import { BaseService } from "../base.service"
import { resolveTenantSettings } from "../platform/settings"
import { getPublicFileUrl } from "../utils"

// Mirrored in
// apps/builder/src/features/media-library/constants.ts because
// @chatbotx.io/business is backend-only and must not be imported from a
// "use client" component. Keep both values in sync.
export const MEDIA_LIBRARY_FILES_PAGE_SIZE = 60

export type ListMediaLibraryFilesInput = {
  workspaceId: string
  folderId?: string | null
  search?: string | null
  filter?: string | null
  page?: number
  perPage?: number
}

class MediaLibraryFileService extends BaseService {
  async list(input: ListMediaLibraryFilesInput) {
    const { storageUrl } = await resolveTenantSettings({
      workspaceId: input.workspaceId,
    })

    const perPage = input.perPage ?? MEDIA_LIBRARY_FILES_PAGE_SIZE

    const { data, total } = await mediaLibraryFileRepository.list({
      ...input,
      perPage,
    })

    return {
      data: data.map((file) => ({
        ...file,
        url: getPublicFileUrl(file.path, storageUrl),
      })),
      pageCount: Math.ceil(total / perPage),
    }
  }

  /**
   * Confirms a storage path belongs to a Media Library file owned by the
   * given workspace, so a client-supplied path can't be used to reference
   * another workspace's (or otherwise arbitrary) storage object.
   */
  findByPath(input: { workspaceId: string; path: string }) {
    return mediaLibraryFileRepository.findByPath(input)
  }

  /**
   * Confirms a DB id belongs to a Media Library file owned by the given
   * workspace, so a client-supplied id can't be used to reference another
   * workspace's (or otherwise arbitrary) storage object.
   */
  findById(input: { workspaceId: string; id: string }) {
    return mediaLibraryFileRepository.findById(input)
  }
}

export const mediaLibraryFileService = new MediaLibraryFileService()
