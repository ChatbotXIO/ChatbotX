"use server"

import { mediaLibraryFileService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListFilesRequest, ListFilesResponse } from "../schema"

export async function listMediaLibraryFiles(
  input: ListFilesRequest,
): Promise<ListFilesResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return await mediaLibraryFileService.list(input)
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
  return await mediaLibraryFileService.findByPath(input)
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
  return await mediaLibraryFileService.findById(input)
}
