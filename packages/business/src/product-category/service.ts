import {
  type DatabaseClient,
  db,
  isUniqueViolationError,
} from "@chatbotx.io/database/client"
import {
  discountCodeRepository,
  productCategoryRepository,
} from "@chatbotx.io/database/repositories"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"
import {
  assertResourceEditable,
  changedKeysOf,
  withDeleteGuard,
} from "../template/installed-resource.service"
import { withTemplateLockedTransaction } from "../template/template-resource-locks"

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
  /**
   * The whole two-level tree, or — with `parentId` — only that category's
   * sub-categories; `name` keeps rows whose name contains it, ignoring case.
   */
  async list(
    workspaceId: string,
    filter: { parentId?: string | null; name?: string | null } = {},
  ) {
    const all =
      await productCategoryRepository.listWithProductCount(workspaceId)
    const keyword = filter.name?.trim().toLowerCase()
    return all.filter(
      (category) =>
        (!filter.parentId || category.parentId === filter.parentId) &&
        (!keyword || category.name.toLowerCase().includes(keyword)),
    )
  }

  /**
   * One page of one level of the tree: the top-level categories, or the
   * children of `parentId`, optionally filtered by name. Each row carries how
   * many sub-categories it has. The tree is small, so it is read whole and cut
   * here rather than paged in SQL.
   */
  async listLevel(input: {
    workspaceId: string
    parentId?: string | null
    name?: string | null
    page?: number
    perPage?: number
  }) {
    const all = await productCategoryRepository.listWithProductCount(
      input.workspaceId,
    )
    const keyword = input.name?.trim().toLowerCase()
    const level = all.filter(
      (category) =>
        (category.parentId ?? null) === (input.parentId ?? null) &&
        (!keyword || category.name.toLowerCase().includes(keyword)),
    )
    const childCounts = new Map<string, number>()
    for (const category of all) {
      if (category.parentId) {
        childCounts.set(
          category.parentId,
          (childCounts.get(category.parentId) ?? 0) + 1,
        )
      }
    }
    const perPage = input.perPage ?? level.length
    const page = input.page ?? 1
    const start = (page - 1) * perPage
    return {
      data: level
        .slice(start, perPage > 0 ? start + perPage : undefined)
        .map((category) => ({
          ...category,
          childCount: childCounts.get(category.id) ?? 0,
        })),
      pageCount:
        perPage > 0 ? Math.max(1, Math.ceil(level.length / perPage)) : 1,
      parent: input.parentId
        ? (all.find((category) => category.id === input.parentId) ?? null)
        : null,
    }
  }

  async listOptions(workspaceId: string) {
    return await productCategoryRepository.list(workspaceId)
  }

  async create(input: {
    workspaceId: string
    name: string
    rank?: number
    parentId?: string | null
    imageUrl?: string | null
    isVisible?: boolean
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

  /** Changes the fields given; `undefined` leaves a field as it is. */
  async update(input: {
    workspaceId: string
    categoryId: string
    name?: string
    parentId?: string | null
    imageUrl?: string | null
    isVisible?: boolean
    rank?: number
  }) {
    const name =
      input.name === undefined ? undefined : normalizeCategoryName(input.name)
    if (name === "") {
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
      // The category and a new parent are locked before the stored row is read,
      // so the diff that decides the guard is computed under the lock.
      const row = await withTemplateLockedTransaction(
        async (tx) => {
          // Visibility and rank are the installer's; name, parent and image are
          // content, and only an actual change to them is guarded (a full form
          // always submits the name).
          const stored = await productCategoryRepository.find(input, tx)
          const submitted = {
            name,
            parentId: input.parentId,
            imageUrl: input.imageUrl,
          }
          const changedKeys = stored
            ? changedKeysOf(stored, submitted)
            : Object.keys(submitted).filter(
                (key) => submitted[key as keyof typeof submitted] !== undefined,
              )
          // A re-parent also locks the new parent category.
          await assertResourceEditable({
            workspaceId: input.workspaceId,
            resourceKind: "productCategory",
            resourceIds: [input.categoryId],
            changedKeys,
            referencedParents: input.parentId
              ? [{ kind: "productCategory", resourceId: input.parentId }]
              : [],
            tx,
          })
          const before = input.parentId === undefined ? undefined : stored
          const updated = await productCategoryRepository.update(
            { ...input, name },
            tx,
          )
          if (updated && before && input.parentId !== undefined) {
            await this.refileReferences({
              workspaceId: input.workspaceId,
              categoryId: input.categoryId,
              previousParentId: before.parentId ?? null,
              parentId: input.parentId,
              tx,
            })
          }
          return updated
        },
        {
          workspaceId: input.workspaceId,
          initialKeys: [
            { kind: "productCategory", resourceId: input.categoryId },
            ...(input.parentId
              ? [
                  {
                    kind: "productCategory" as const,
                    resourceId: input.parentId,
                  },
                ]
              : []),
          ],
        },
      )
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
    const row = await db.transaction(async (tx) => {
      const children = await productCategoryRepository.listChildren(
        { workspaceId: input.workspaceId, parentId: input.categoryId },
        tx,
      )
      // The children cascade with the root, so every one of them must be
      // deletable too: a locked subcategory blocks deleting its parent.
      const guarded = [input.categoryId, ...children.map(({ id }) => id)]
      return await withDeleteGuard(
        {
          workspaceId: input.workspaceId,
          targets: [{ resourceKind: "productCategory", resourceIds: guarded }],
          tx,
        },
        async () => {
          // Deactivate first: deleting clears each code's category, after
          // which they could no longer be told apart from codes that never
          // had one.
          await discountCodeRepository.deactivateByCategoryIds(
            { workspaceId: input.workspaceId, categoryIds: guarded },
            tx,
          )
          return await productCategoryRepository.delete(input, tx)
        },
      )
    })
    if (!row) {
      throw notFoundException("Product category not found")
    }
    await this.invalidateCacheTags(this.cacheTag(input.workspaceId))
  }

  /**
   * A category that changes level leaves products and vendors pointing at it
   * through the wrong column; file them where the tree now says they belong.
   */
  private async refileReferences(input: {
    workspaceId: string
    categoryId: string
    previousParentId: string | null
    parentId: string | null
    tx: DatabaseClient
  }) {
    if (input.parentId === input.previousParentId) {
      return
    }
    if (input.parentId) {
      await productCategoryRepository.fileUnderParent(
        {
          workspaceId: input.workspaceId,
          categoryId: input.categoryId,
          parentId: input.parentId,
        },
        input.tx,
      )
      return
    }
    await productCategoryRepository.fileAsTopLevel(
      { workspaceId: input.workspaceId, categoryId: input.categoryId },
      input.tx,
    )
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
