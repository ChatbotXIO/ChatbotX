"use server"

import { resolveTenantSettings } from "@chatbotx.io/business"
import { getPublicFileUrl } from "@chatbotx.io/business/utils"
import { mediaLibraryFileRepository } from "@chatbotx.io/database/repositories"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import {
  type ListFilesRequest,
  type ListFilesResponse,
  MEDIA_LIBRARY_FILES_PAGE_SIZE,
} from "../schema"

export async function listMediaLibraryFiles(
  input: ListFilesRequest,
): Promise<ListFilesResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const { storageUrl } = await resolveTenantSettings({
    workspaceId: input.workspaceId,
  })

  const data = await mediaLibraryFileRepository.list({
    ...input,
    perPage: MEDIA_LIBRARY_FILES_PAGE_SIZE,
  })

  return {
    data: data.map((file) => ({
      ...file,
      url: getPublicFileUrl(file.path, storageUrl),
    })),
  }
}

/**
 * Confirms a storage path belongs to a Media Library file owned by the given
 * workspace, so a client-supplied path can't be used to reference another
 * workspace's (or otherwise arbitrary) storage object.
 */
export async function findMediaLibraryFileByPath(input: {
  workspaceId: string
  path: string
}) {
  return await mediaLibraryFileRepository.findByPath(input)
}

/**
 * Confirms a DB id belongs to a Media Library file owned by the given
 * workspace, so a client-supplied id can't be used to reference another
 * workspace's (or otherwise arbitrary) storage object.
 */
export async function findMediaLibraryFileById(input: {
  workspaceId: string
  id: string
}) {
  return await mediaLibraryFileRepository.findById(input)
}
