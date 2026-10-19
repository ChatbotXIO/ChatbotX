import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import {
  mediaLibraryFileRepository,
  type SavedReplyImageWithFile,
  savedReplyImageRepository,
} from "@chatbotx.io/database/repositories"
import { savedReplyModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import {
  isImageMimeType,
  SAVED_REPLY_MAX_IMAGES,
} from "@chatbotx.io/utils/inbox-image-support"
import { notFoundException, validationException } from "../errors"
import { resolveTenantSettings } from "../platform/settings"
import { assertDeletable } from "../template/installed-resource.service"
import { getPublicFileUrl } from "../utils"

type SavedReplyModel = typeof savedReplyModel.$inferSelect

export type SavedReplyImage = {
  id: string
  mediaLibraryFileId: string
  name: string
  mimeType: string
  size: number
  url: string
}

export type SavedReplyWithImages = SavedReplyModel & {
  images: SavedReplyImage[]
}

type SavedReplyInput = {
  shortcut: string
  text?: string | null
  /** Ordered media library file ids. */
  imageFileIds?: string[]
}

/**
 * An update keeps whatever it leaves out: an omitted `text` keeps the
 * current text and an omitted `imageFileIds` keeps the current images
 * (`[]` removes them all).
 */
type SavedReplyUpdate = {
  shortcut: string
  text?: string
  imageFileIds?: string[]
}

class SavedReplyService {
  async create(
    input: SavedReplyInput & { workspaceId: string },
  ): Promise<SavedReplyWithImages> {
    const imageFileIds = input.imageFileIds ?? []
    const text = input.text?.trim() ?? ""
    assertTextOrImages(text, imageFileIds.length)
    await this.assertImageFiles(input.workspaceId, imageFileIds)

    const savedReply = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(savedReplyModel)
        .values({
          id: createId(),
          workspaceId: input.workspaceId,
          shortcut: input.shortcut,
          text,
        })
        .returning()

      await savedReplyImageRepository.replaceForSavedReply(
        {
          workspaceId: input.workspaceId,
          savedReplyId: created.id,
          mediaLibraryFileIds: imageFileIds,
        },
        tx,
      )

      return created
    })

    const [withImages] = await this.attachImages(input.workspaceId, [
      savedReply,
    ])
    return withImages
  }

  async findByIdOrFail(props: {
    workspaceId: string
    id: string
  }): Promise<SavedReplyWithImages> {
    const savedReply = await findOrFail({
      table: savedReplyModel,
      where: { id: props.id, workspaceId: props.workspaceId },
      message: "Saved reply not found",
    })

    const [withImages] = await this.attachImages(props.workspaceId, [
      savedReply,
    ])
    return withImages
  }

  async update(
    ctx: { workspaceId: string; id: string },
    data: SavedReplyUpdate,
  ): Promise<SavedReplyWithImages> {
    const savedReply = await findOrFail({
      table: savedReplyModel,
      where: { id: ctx.id, workspaceId: ctx.workspaceId },
      message: "Saved reply not found",
    })

    const text = data.text === undefined ? savedReply.text : data.text.trim()
    const imageCount = data.imageFileIds
      ? data.imageFileIds.length
      : await savedReplyImageRepository.countBySavedReplyId({
          workspaceId: ctx.workspaceId,
          savedReplyId: savedReply.id,
        })
    assertTextOrImages(text, imageCount)
    if (data.imageFileIds) {
      await this.assertImageFiles(ctx.workspaceId, data.imageFileIds)
    }

    const updatedSavedReply = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(savedReplyModel)
        .set({ shortcut: data.shortcut, text })
        .where(eq(savedReplyModel.id, savedReply.id))
        .returning()

      if (data.imageFileIds) {
        await savedReplyImageRepository.replaceForSavedReply(
          {
            workspaceId: ctx.workspaceId,
            savedReplyId: savedReply.id,
            mediaLibraryFileIds: data.imageFileIds,
          },
          tx,
        )
      }

      return updated
    })

    const [withImages] = await this.attachImages(ctx.workspaceId, [
      updatedSavedReply,
    ])
    return withImages
  }

  async delete(input: { workspaceId: string; id: string }): Promise<void> {
    const savedReply = await findOrFail({
      table: savedReplyModel,
      where: { id: input.id, workspaceId: input.workspaceId },
      message: "Saved reply not found",
    })

    await assertDeletable({
      workspaceId: input.workspaceId,
      resourceKind: "savedReply",
      resourceIds: [input.id],
    })

    await db
      .delete(savedReplyModel)
      .where(eq(savedReplyModel.id, savedReply.id))
  }

  async listByWorkspaceId(
    workspaceId: string,
  ): Promise<SavedReplyWithImages[]> {
    const savedReplies = await db.query.savedReplyModel.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
    })

    return await this.attachImages(workspaceId, savedReplies)
  }

  /**
   * Every id must be a media library file of this workspace and an image —
   * saved replies carry images only.
   */
  private async assertImageFiles(
    workspaceId: string,
    imageFileIds: string[],
  ): Promise<void> {
    if (imageFileIds.length === 0) {
      return
    }
    if (imageFileIds.length > SAVED_REPLY_MAX_IMAGES) {
      throw validationException(
        "imageFileIds",
        `A saved reply can carry at most ${SAVED_REPLY_MAX_IMAGES} images`,
        { max: SAVED_REPLY_MAX_IMAGES },
      )
    }
    if (new Set(imageFileIds).size !== imageFileIds.length) {
      throw validationException(
        "imageFileIds",
        "The same image is listed more than once",
      )
    }

    const files = await mediaLibraryFileRepository.findByIds({
      workspaceId,
      ids: imageFileIds,
    })
    const foundIds = new Set(files.map((file) => file.id))
    const missingId = imageFileIds.find((id) => !foundIds.has(id))
    if (missingId) {
      throw notFoundException(`MediaLibraryFile ${missingId} not found`)
    }

    const nonImage = files.find((file) => !isImageMimeType(file.mimeType))
    if (nonImage) {
      throw validationException("imageFileIds", "Only images are allowed", {
        fileName: nonImage.name,
      })
    }
  }

  private async attachImages(
    workspaceId: string,
    savedReplies: SavedReplyModel[],
  ): Promise<SavedReplyWithImages[]> {
    const images = await savedReplyImageRepository.listBySavedReplyIds({
      workspaceId,
      savedReplyIds: savedReplies.map((savedReply) => savedReply.id),
    })
    if (images.length === 0) {
      return savedReplies.map((savedReply) => ({ ...savedReply, images: [] }))
    }

    const { storageUrl } = await resolveTenantSettings({ workspaceId })
    const imagesBySavedReplyId = groupImagesBySavedReplyId(images, storageUrl)

    return savedReplies.map((savedReply) => ({
      ...savedReply,
      images: imagesBySavedReplyId.get(savedReply.id) ?? [],
    }))
  }
}

function assertTextOrImages(text: string, imageCount: number) {
  if (text.length === 0 && imageCount === 0) {
    throw validationException(
      "text",
      "A saved reply needs text or at least one image",
    )
  }
}

function groupImagesBySavedReplyId(
  images: SavedReplyImageWithFile[],
  storageUrl: Parameters<typeof getPublicFileUrl>[1],
): Map<string, SavedReplyImage[]> {
  const grouped = new Map<string, SavedReplyImage[]>()
  for (const image of images) {
    const list = grouped.get(image.savedReplyId) ?? []
    list.push({
      id: image.id,
      mediaLibraryFileId: image.mediaLibraryFileId,
      name: image.file.name,
      mimeType: image.file.mimeType,
      size: image.file.size,
      url: getPublicFileUrl(image.file.path, storageUrl),
    })
    grouped.set(image.savedReplyId, list)
  }
  return grouped
}

export const savedReplyService = new SavedReplyService()
