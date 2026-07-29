import { type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import {
  productCategoryRepository,
  productRepository,
} from "@chatbotx.io/database/repositories"
import {
  productAddonModel,
  productVariantModel,
  productVariantOptionModel,
} from "@chatbotx.io/database/schema"
import type {
  ProductAddonModel,
  ProductModel,
  ProductVariantModel,
  ProductVariantOptionModel,
} from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"

export type ProductImageInput = {
  id?: string
  mode: "link" | "file"
  url: string
}

export type ProductWriteData = {
  workspaceId: string
  name: string
  shortDescription?: string | null
  longDescription?: string | null
  price?: number
  taxes?: number
  discount?: number
  sku?: string | null
  inventoryPolicy?: "dont_track" | "track"
  inventoryQuantity?: number
  allowOutOfStockPurchase?: boolean
  images?: ProductImageInput[]
  tags?: string[]
  vendor?: string | null
  rank?: number
  categoryId?: string | null
  subcategoryId?: string | null
  isActive?: boolean
  isSearchable?: boolean
  allowSpecialRequest?: boolean
  isAddonOnly?: boolean
}

export type ProductVariantOptionInput = {
  name: string
  values: string[]
  position: number
}

export type ProductVariantInput = {
  combination: Record<string, string>
  price: number
  isEnabled: boolean
}

export type ProductAddonInput = {
  name: string
  maxSelections: number
  addonProductIds: string[]
}

export type ProductFullWriteData = ProductWriteData & {
  variantOptions: ProductVariantOptionInput[]
  variants: ProductVariantInput[]
  addons: ProductAddonInput[]
}

/** The form calls it `mode`; the column stores it as `type`. */
const toImageRows = (images: ProductImageInput[]) =>
  images.map(({ mode, url }) => ({ type: mode, url }))

class ProductService extends BaseService {
  private async assertReferencesBelongToWorkspace(input: {
    workspaceId: string
    categoryId?: string | null
    subcategoryId?: string | null
    /**
     * The category the sub-category has to sit under. Only a partial update
     * that names a sub-category without repeating its category needs this;
     * everywhere else the incoming `categoryId` is the answer.
     */
    expectedParentId?: string | null
    addons?: ProductAddonInput[]
    tx: DatabaseClient
  }): Promise<void> {
    if (input.categoryId) {
      const category = await productCategoryRepository.find(
        {
          workspaceId: input.workspaceId,
          categoryId: input.categoryId,
        },
        input.tx,
      )
      if (!category) {
        throw notFoundException("Product category does not exist.")
      }
    }

    if (input.subcategoryId) {
      const subcategory = await productCategoryRepository.find(
        {
          workspaceId: input.workspaceId,
          categoryId: input.subcategoryId,
        },
        input.tx,
      )
      // Checking the parentage here, not just existence: a sub-category that
      // belongs to a different category would silently break the filter, which
      // reaches products through whichever of the two columns matches.
      if (!subcategory) {
        throw notFoundException("Product sub-category does not exist.")
      }
      const expectedParentId =
        input.expectedParentId === undefined
          ? (input.categoryId ?? null)
          : input.expectedParentId
      if (subcategory.parentId !== expectedParentId) {
        throw notFoundException(
          "Product sub-category does not belong to the selected category.",
        )
      }
    }

    const addonProductIds = Array.from(
      new Set((input.addons ?? []).flatMap((addon) => addon.addonProductIds)),
    )
    if (addonProductIds.length === 0) {
      return
    }
    const addonProducts = await productRepository.findByIds(
      {
        workspaceId: input.workspaceId,
        productIds: addonProductIds,
      },
      input.tx,
    )
    if (addonProducts.length !== addonProductIds.length) {
      throw notFoundException("One or more addon products do not exist.")
    }
  }

  /**
   * A patch may name a sub-category without repeating the category it sits
   * under. Checking that against `null` would reject a pair that is in fact
   * valid, so the category the product already has stands in for the absent
   * one. `undefined` means the patch answers the question by itself.
   */
  private async resolveExpectedParentId(input: {
    productId: string
    workspaceId: string
    data: Partial<ProductWriteData>
    tx: DatabaseClient
  }): Promise<string | null | undefined> {
    if (input.data.categoryId !== undefined || !input.data.subcategoryId) {
      return
    }
    const current = await productRepository.find(
      { workspaceId: input.workspaceId, productId: input.productId },
      input.tx,
    )
    return current?.categoryId ?? null
  }

  private async insert(
    data: ProductWriteData,
    tx: DatabaseClient,
  ): Promise<ProductModel> {
    const { images = [], ...productData } = data
    const product = await productRepository.create(
      { ...productData, images: toImageRows(images) },
      tx,
    )
    if (!product) {
      throw new Error("Failed to create product")
    }
    return product
  }

  private async applyPatch(input: {
    productId: string
    workspaceId: string
    data: Partial<Omit<ProductWriteData, "workspaceId">>
    tx: DatabaseClient
  }): Promise<void> {
    const { images, ...productData } = input.data
    const updated = await productRepository.update(
      {
        workspaceId: input.workspaceId,
        productId: input.productId,
        // Absent images mean "leave them alone", not "clear them".
        values: {
          ...productData,
          ...(images ? { images: toImageRows(images) } : {}),
        },
      },
      input.tx,
    )
    if (!updated) {
      throw notFoundException("Product does not exist.")
    }
  }

  async create(props: {
    data: ProductWriteData
    tx?: DatabaseClient
  }): Promise<ProductModel> {
    const { data, tx = db } = props
    await this.assertReferencesBelongToWorkspace({
      workspaceId: data.workspaceId,
      categoryId: data.categoryId,
      subcategoryId: data.subcategoryId,
      tx,
    })
    return await this.insert(data, tx)
  }

  async createFull(data: ProductFullWriteData): Promise<ProductModel> {
    const { variantOptions, variants, addons, ...productData } = data
    return await db.transaction(async (tx) => {
      // One guard covering categories and addons together, so the row is never
      // inserted before every reference is known to live in this workspace.
      await this.assertReferencesBelongToWorkspace({
        workspaceId: data.workspaceId,
        categoryId: data.categoryId,
        subcategoryId: data.subcategoryId,
        addons,
        tx,
      })
      const product = await this.insert(productData, tx)
      await Promise.all([
        productVariantOptionService.createBulk({
          productId: product.id,
          options: variantOptions,
          tx,
        }),
        productVariantService.createBulk({
          productId: product.id,
          variants,
          tx,
        }),
        productAddonService.createBulk({
          productId: product.id,
          addons,
          tx,
        }),
      ])
      return product
    })
  }

  async update(props: {
    productId: string
    workspaceId: string
    data: Partial<Omit<ProductWriteData, "workspaceId">>
    tx?: DatabaseClient
  }): Promise<void> {
    const { productId, workspaceId, data, tx = db } = props
    await this.assertReferencesBelongToWorkspace({
      workspaceId,
      categoryId: data.categoryId,
      subcategoryId: data.subcategoryId,
      expectedParentId: await this.resolveExpectedParentId({
        productId,
        workspaceId,
        data,
        tx,
      }),
      tx,
    })
    await this.applyPatch({ productId, workspaceId, data, tx })
  }

  async updateFull(
    input: Omit<ProductFullWriteData, "workspaceId"> & {
      workspaceId: string
      productId: string
    },
  ): Promise<void> {
    const {
      productId,
      workspaceId,
      variantOptions,
      variants,
      addons,
      ...data
    } = input
    await db.transaction(async (tx) => {
      await this.assertReferencesBelongToWorkspace({
        workspaceId,
        categoryId: data.categoryId,
        subcategoryId: data.subcategoryId,
        expectedParentId: await this.resolveExpectedParentId({
          productId,
          workspaceId,
          data,
          tx,
        }),
        addons,
        tx,
      })
      await this.applyPatch({ productId, workspaceId, data, tx })
      await Promise.all([
        productVariantOptionService.deleteByProductId({ productId, tx }),
        productVariantService.deleteByProductId({ productId, tx }),
        productAddonService.deleteByProductId({ productId, tx }),
      ])
      await Promise.all([
        productVariantOptionService.createBulk({
          productId,
          options: variantOptions,
          tx,
        }),
        productVariantService.createBulk({ productId, variants, tx }),
        productAddonService.createBulk({ productId, addons, tx }),
      ])
    })
  }

  async delete(input: {
    ids: string[]
    workspaceId: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { ids, workspaceId, tx = db } = input
    await productRepository.deleteByIds({ workspaceId, productIds: ids }, tx)
  }

  async list(input: Parameters<typeof productRepository.list>[0]) {
    return await productRepository.list(input)
  }

  async findById(id: string, workspaceId: string) {
    const product = await productRepository.findDetail({ id, workspaceId })
    if (!product) {
      throw notFoundException("Product does not exist.")
    }
    return product
  }

  async listFormOptions(workspaceId: string) {
    return await productRepository.listFormOptions({ workspaceId })
  }

  async createFromImport(input: {
    workspaceId: string
    products: Parameters<
      typeof productRepository.createFromImport
    >[0]["products"]
  }) {
    return await productRepository.createFromImport(input)
  }

  async listForCatalogSync(
    input: Parameters<typeof productRepository.listForCatalogSync>[0],
  ) {
    return await productRepository.listForCatalogSync(input)
  }
}

class ProductVariantOptionService extends BaseService {
  async createBulk(input: {
    productId: string
    options: ProductVariantOptionInput[]
    tx?: DatabaseClient
  }): Promise<ProductVariantOptionModel[]> {
    const { productId, options, tx = db } = input
    if (options.length === 0) {
      return []
    }
    return await tx
      .insert(productVariantOptionModel)
      .values(
        options.map((option) => ({ id: createId(), productId, ...option })),
      )
      .returning()
  }

  async deleteByProductId(input: {
    productId: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { productId, tx = db } = input
    await tx
      .delete(productVariantOptionModel)
      .where(eq(productVariantOptionModel.productId, productId))
  }
}

class ProductVariantService extends BaseService {
  async createBulk(input: {
    productId: string
    variants: ProductVariantInput[]
    tx?: DatabaseClient
  }): Promise<ProductVariantModel[]> {
    const { productId, variants, tx = db } = input
    if (variants.length === 0) {
      return []
    }
    return await tx
      .insert(productVariantModel)
      .values(
        variants.map((variant) => ({ id: createId(), productId, ...variant })),
      )
      .returning()
  }

  async deleteByProductId(input: {
    productId: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { productId, tx = db } = input
    await tx
      .delete(productVariantModel)
      .where(eq(productVariantModel.productId, productId))
  }
}

class ProductAddonService extends BaseService {
  async createBulk(input: {
    productId: string
    addons: ProductAddonInput[]
    tx?: DatabaseClient
  }): Promise<ProductAddonModel[]> {
    const { productId, addons, tx = db } = input
    if (addons.length === 0) {
      return []
    }
    return await tx
      .insert(productAddonModel)
      .values(addons.map((addon) => ({ id: createId(), productId, ...addon })))
      .returning()
  }

  async deleteByProductId(input: {
    productId: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { productId, tx = db } = input
    await tx
      .delete(productAddonModel)
      .where(eq(productAddonModel.productId, productId))
  }
}

export const productService = new ProductService()
export const productVariantOptionService = new ProductVariantOptionService()
export const productVariantService = new ProductVariantService()
export const productAddonService = new ProductAddonService()
