import {
  type DatabaseClient,
  db,
  isUniqueViolationError,
} from "@chatbotx.io/database/client"
import { productCategoryRepository } from "@chatbotx.io/database/repositories"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"

const normalizeCategoryName = (name: string): string => name.trim()

export type ProductCategoryPath = {
  categoryName: string
  subcategoryName?: string
}

export const getProductCategoryPathKey = (path: ProductCategoryPath): string =>
  `${normalizeCategoryName(path.categoryName).toLowerCase()}\u0000${normalizeCategoryName(path.subcategoryName ?? "").toLowerCase()}`

/** Keyed by parent row id, not by category name — distinct from `getProductCategoryPathKey`. */
const getCategoryChildKey = (parentId: string | null, name: string): string =>
  `${parentId}\u0000${normalizeCategoryName(name).toLowerCase()}`

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

  /**
   * Matching is case-insensitive (an importer's "electronics" must land on an
   * existing "Electronics"), so — like `resolvePaths` — this loads the full
   * top-level list and folds case in JS rather than querying by exact name.
   * A DB round-trip that only matched exact case would create a duplicate
   * category on every casing drift.
   */
  async resolveByNames(input: {
    workspaceId: string
    names: string[]
    createMissing: boolean
    tx?: DatabaseClient
  }) {
    const { tx = db } = input
    const names = Array.from(
      new Map(
        input.names
          .map(normalizeCategoryName)
          .filter(Boolean)
          .map((name) => [name.toLowerCase(), name] as const),
      ).values(),
    )

    let rows = await productCategoryRepository.list(input.workspaceId, tx)
    const topLevelByName = () =>
      new Map(
        rows
          .filter((row) => !row.parentId)
          .map((row) => [normalizeCategoryName(row.name).toLowerCase(), row]),
      )

    if (input.createMissing) {
      const existing = topLevelByName()
      const missingNames = names.filter(
        (name) => !existing.has(name.toLowerCase()),
      )
      if (missingNames.length > 0) {
        await productCategoryRepository.createMissingByName(
          { workspaceId: input.workspaceId, names: missingNames },
          tx,
        )
        rows = await productCategoryRepository.list(input.workspaceId, tx)
      }
    }

    const resolved = topLevelByName()
    return new Map(
      names.flatMap((name) => {
        const row = resolved.get(name.toLowerCase())
        return row ? [[name.toLowerCase(), row.id] as const] : []
      }),
    )
  }

  async resolvePaths(input: {
    workspaceId: string
    paths: ProductCategoryPath[]
    createMissing: boolean
    tx?: DatabaseClient
  }) {
    const { tx = db } = input
    const paths = Array.from(
      new Map(
        input.paths
          .map((path) => ({
            categoryName: normalizeCategoryName(path.categoryName),
            subcategoryName:
              normalizeCategoryName(path.subcategoryName ?? "") || undefined,
          }))
          .filter((path) => path.categoryName)
          .map((path) => [getProductCategoryPathKey(path), path]),
      ).values(),
    )
    let rows = await productCategoryRepository.list(input.workspaceId, tx)
    const topLevelByName = () =>
      new Map(
        rows
          .filter((row) => !row.parentId)
          .map((row) => [normalizeCategoryName(row.name).toLowerCase(), row]),
      )

    if (input.createMissing) {
      const currentTopLevel = topLevelByName()
      const missingTopLevelNames = paths
        .map((path) => path.categoryName)
        .filter(
          (name) =>
            !currentTopLevel.has(normalizeCategoryName(name).toLowerCase()),
        )
      if (missingTopLevelNames.length > 0) {
        await productCategoryRepository.createMissingByName(
          {
            workspaceId: input.workspaceId,
            names: missingTopLevelNames,
          },
          tx,
        )
        rows = await productCategoryRepository.list(input.workspaceId, tx)
      }

      const refreshedTopLevel = topLevelByName()
      const existingChildren = new Set(
        rows
          .filter((row) => row.parentId)
          .map((row) => getCategoryChildKey(row.parentId, row.name)),
      )
      const children = paths.flatMap((path) => {
        if (!path.subcategoryName) {
          return []
        }
        const parent = refreshedTopLevel.get(path.categoryName.toLowerCase())
        if (
          !parent ||
          existingChildren.has(
            getCategoryChildKey(parent.id, path.subcategoryName),
          )
        ) {
          return []
        }
        return [{ parentId: parent.id, name: path.subcategoryName }]
      })
      if (children.length > 0) {
        await productCategoryRepository.createMissingChildren(
          { workspaceId: input.workspaceId, children },
          tx,
        )
        rows = await productCategoryRepository.list(input.workspaceId, tx)
      }
    }

    const resolvedTopLevel = topLevelByName()
    const childByParentAndName = new Map(
      rows
        .filter((row) => row.parentId)
        .map((row) => [getCategoryChildKey(row.parentId, row.name), row]),
    )
    return new Map(
      paths.flatMap((path) => {
        const category = resolvedTopLevel.get(path.categoryName.toLowerCase())
        if (!category) {
          return []
        }
        const subcategory = path.subcategoryName
          ? childByParentAndName.get(
              getCategoryChildKey(category.id, path.subcategoryName),
            )
          : undefined
        return [
          [
            getProductCategoryPathKey(path),
            {
              categoryId: category.id,
              subcategoryId: subcategory?.id ?? null,
            },
          ] as const,
        ]
      }),
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
