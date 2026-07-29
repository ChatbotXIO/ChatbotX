import { isUniqueViolationError } from "@chatbotx.io/database/client"
import { productCategoryRepository } from "@chatbotx.io/database/repositories"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"

const normalizeCategoryName = (name: string): string => name.trim()

class ProductCategoryService extends BaseService {
  async list(workspaceId: string) {
    return await productCategoryRepository.listWithProductCount(workspaceId)
  }

  async listOptions(workspaceId: string) {
    return await productCategoryRepository.list(workspaceId)
  }

  async create(input: {
    workspaceId: string
    name: string
    rank?: number
    parentId?: string | null
  }) {
    const name = normalizeCategoryName(input.name)
    if (!name) {
      throw new ChatbotXException(
        "Product category name is required",
        "productCategoryNameRequired",
      )
    }
    await this.assertParentCanAdopt(input)
    try {
      const row = await productCategoryRepository.create({ ...input, name })
      await this.invalidateCacheTags(this.cacheTag(input.workspaceId))
      return row
    } catch (error) {
      if (isUniqueViolationError(error)) {
        throw new ChatbotXException(
          "Product category already exists",
          "productCategoryDuplicated",
        )
      }
      throw error
    }
  }

  async update(input: {
    workspaceId: string
    categoryId: string
    name: string
    parentId?: string | null
  }) {
    const name = normalizeCategoryName(input.name)
    if (!name) {
      throw new ChatbotXException(
        "Product category name is required",
        "productCategoryNameRequired",
      )
    }
    if (input.parentId !== undefined) {
      await this.assertParentCanAdopt(input)
      await this.assertHasNoChildren(input)
    }
    try {
      const row = await productCategoryRepository.update({ ...input, name })
      if (!row) {
        throw notFoundException("Product category not found")
      }
      await this.invalidateCacheTags(this.cacheTag(input.workspaceId))
      return row
    } catch (error) {
      if (isUniqueViolationError(error)) {
        throw new ChatbotXException(
          "Product category already exists",
          "productCategoryDuplicated",
        )
      }
      throw error
    }
  }

  async delete(input: { workspaceId: string; categoryId: string }) {
    const row = await productCategoryRepository.delete(input)
    if (!row) {
      throw notFoundException("Product category not found")
    }
    await this.invalidateCacheTags(this.cacheTag(input.workspaceId))
  }

  async countProducts(input: { workspaceId: string; categoryId: string }) {
    return await productCategoryRepository.countProducts(input)
  }

  async resolveByNames(input: {
    workspaceId: string
    names: string[]
    createMissing: boolean
  }) {
    const names = Array.from(
      new Set(input.names.map(normalizeCategoryName).filter(Boolean)),
    )
    const rows = input.createMissing
      ? await productCategoryRepository.createMissingByName({
          workspaceId: input.workspaceId,
          names,
        })
      : await productCategoryRepository.findByNames({
          workspaceId: input.workspaceId,
          names,
        })

    return new Map(
      rows.map((row) => [
        normalizeCategoryName(row.name).toLowerCase(),
        row.id,
      ]),
    )
  }

  /**
   * The tree is two levels deep, so a parent must exist, live in the same
   * workspace, and itself be top-level. Without the last check a chain could
   * grow past what the product form is able to express.
   */
  private async assertParentCanAdopt(input: {
    workspaceId: string
    parentId?: string | null
    categoryId?: string
  }) {
    if (!input.parentId) {
      return
    }
    if (input.parentId === input.categoryId) {
      throw new ChatbotXException(
        "A product category cannot be its own parent",
        "productCategoryParentSelf",
      )
    }
    const parent = await productCategoryRepository.find({
      workspaceId: input.workspaceId,
      categoryId: input.parentId,
    })
    if (!parent) {
      throw notFoundException("Parent product category not found")
    }
    if (parent.parentId) {
      throw new ChatbotXException(
        "A sub-category cannot contain further sub-categories",
        "productCategoryNestingTooDeep",
      )
    }
  }

  /** Mirror of the depth rule: a category with children must stay top-level. */
  private async assertHasNoChildren(input: {
    workspaceId: string
    categoryId: string
    parentId?: string | null
  }) {
    if (!input.parentId) {
      return
    }
    const children = await productCategoryRepository.listChildren({
      workspaceId: input.workspaceId,
      parentId: input.categoryId,
    })
    if (children.length > 0) {
      throw new ChatbotXException(
        "A category with sub-categories cannot itself become a sub-category",
        "productCategoryNestingTooDeep",
      )
    }
  }

  private cacheTag(workspaceId: string) {
    return `product-categories:${workspaceId}`
  }
}

export const productCategoryService = new ProductCategoryService()
