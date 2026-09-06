"use server"

import { mediaLibraryService } from "@chatbotx.io/business"
import {
  mediaLibraryFileRepository,
  mediaLibraryFolderRepository,
} from "@chatbotx.io/database/repositories"
import { createId } from "@chatbotx.io/utils"
import type {
  CreateFileRequest,
  CreateFolderRequest,
  DeleteFileRequest,
  DeleteFolderRequest,
  MoveFilesRequest,
  RenameFolderRequest,
  ToggleFavouriteRequest,
} from "../schema"

export async function createMediaLibraryFolder(input: CreateFolderRequest) {
  return await mediaLibraryFolderRepository.create({
    id: createId(),
    name: input.name,
    workspaceId: input.workspaceId,
  })
}

export async function renameMediaLibraryFolder(input: RenameFolderRequest) {
  await mediaLibraryFolderRepository.rename({
    folderId: input.folderId,
    workspaceId: input.workspaceId,
    name: input.name,
  })
}

export async function deleteMediaLibraryFolder(input: DeleteFolderRequest) {
  await mediaLibraryService.deleteFolder({
    workspaceId: input.workspaceId,
    folderId: input.folderId,
  })
}

export async function createMediaLibraryFile(input: CreateFileRequest) {
  return await mediaLibraryService.createFile(input)
}

export async function deleteMediaLibraryFile(input: DeleteFileRequest) {
  await mediaLibraryService.deleteFile({
    workspaceId: input.workspaceId,
    fileId: input.fileId,
  })
}

export async function moveMediaLibraryFiles(input: MoveFilesRequest) {
  await mediaLibraryFileRepository.moveToFolder({
    workspaceId: input.workspaceId,
    fileIds: input.fileIds,
    folderId: input.folderId ?? null,
  })
}

export async function toggleMediaLibraryFavourite(
  input: ToggleFavouriteRequest,
) {
  await mediaLibraryService.toggleFavourite({
    workspaceId: input.workspaceId,
    fileId: input.fileId,
  })
}

export async function recordMediaLibraryFileAccess(input: {
  workspaceId: string
  fileId: string
}) {
  await mediaLibraryFileRepository.touchLastAccessedAt({
    workspaceId: input.workspaceId,
    fileId: input.fileId,
  })
}
