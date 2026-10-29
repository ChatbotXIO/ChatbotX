import { db, isUniqueViolationError } from "@chatbotx.io/database/client"
import { placeCategoryRepository } from "@chatbotx.io/database/repositories"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"

const normalizeName = (name: string): string => name.trim()

const nameRequired = () =>
  new ChatbotXException(
    "Place category name is required",
    "placeCategoryNameRequired",
  )

const duplicated = () =>
  new ChatbotXException(
    "Place category already exists",
    "placeCategoryDuplicated",
    409,
  )

export type PlaceCategoryListItem = {
  id: string
  name: string
  rank: number
  locationCount: number
  createdAt: Date
  updatedAt: Date
}

class PlaceCategoryService extends BaseService {
  async list(workspaceId: string): Promise<PlaceCategoryListItem[]> {
    const rows =
      await placeCategoryRepository.listWithLocationCount(workspaceId)
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      rank: row.rank,
      locationCount: row.locationCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }))
  }

  async find(input: { workspaceId: string; categoryId: string }) {
    const row = await placeCategoryRepository.find(input)
    if (!row) {
      throw notFoundException("Place category not found")
    }
    return row
  }

  async create(input: { workspaceId: string; name: string; rank?: number }) {
    const name = normalizeName(input.name)
    if (!name) {
      throw nameRequired()
    }
    try {
      const row = await placeCategoryRepository.create({
        workspaceId: input.workspaceId,
        name,
        ...(input.rank === undefined ? {} : { rank: input.rank }),
      })
      if (!row) {
        throw new Error("Failed to create place category")
      }
      await this.invalidateCacheTags(this.cacheTag(input.workspaceId))
      return row
    } catch (error) {
      if (isUniqueViolationError(error)) {
        throw duplicated()
      }
      throw error
    }
  }

  async update(input: {
    workspaceId: string
    categoryId: string
    data: { name?: string; rank?: number }
  }) {
    const name =
      input.data.name === undefined ? undefined : normalizeName(input.data.name)
    if (name === "") {
      throw nameRequired()
    }
    try {
      const row = await placeCategoryRepository.update({
        workspaceId: input.workspaceId,
        categoryId: input.categoryId,
        values: {
          ...(name === undefined ? {} : { name }),
          ...(input.data.rank === undefined ? {} : { rank: input.data.rank }),
        },
      })
      if (!row) {
        throw notFoundException("Place category not found")
      }
      await this.invalidateCacheTags(this.cacheTag(input.workspaceId))
      return row
    } catch (error) {
      if (isUniqueViolationError(error)) {
        throw duplicated()
      }
      throw error
    }
  }

  /** Its locations stay; they just lose their category. */
  async delete(input: {
    workspaceId: string
    categoryId: string
  }): Promise<{ uncategorizedLocationCount: number }> {
    const uncategorizedLocationCount = await db.transaction(async (tx) => {
      const count = await placeCategoryRepository.countLocations(input, tx)
      const row = await placeCategoryRepository.delete(input, tx)
      if (!row) {
        throw notFoundException("Place category not found")
      }
      return count
    })
    await this.invalidateCacheTags(this.cacheTag(input.workspaceId))
    return { uncategorizedLocationCount }
  }

  private cacheTag(workspaceId: string) {
    return `place-categories:${workspaceId}`
  }
}

export const placeCategoryService = new PlaceCategoryService()
