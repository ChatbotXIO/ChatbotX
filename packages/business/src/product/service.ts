import { type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import {
  discountCodeRepository,
  type ProductImportInsert,
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
import { assertDeletable } from "../template/installed-resource.service"
import { vendorService } from "../vendor/service"

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
  /** Picks an existing vendor. Wins over `vendor` when both are given. */
  vendorId?: string | null
  /**
   * Names the vendor instead of picking one; a name not seen before creates
   * the vendor. Kept so the product API, imports and templates — which all
   * carry a vendor name — keep working.
   */
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
   * Changing the category without naming a sub-category would leave the stored
   * sub-category under the old category. Drop it unless it already sits under
   * the new category.
   */
  private async withConsistentSubcategory<
    Data extends { categoryId?: string | null; subcategoryId?: string | null },
  >(input: {
    productId: string
    workspaceId: string
    data: Data
    tx: DatabaseClient
  }): Promise<Data> {
    const { data } = input
    if (data.categoryId === undefined || data.subcategoryId !== undefined) {
      return data
    }
    const current = await productRepository.find(
      { workspaceId: input.workspaceId, productId: input.productId },
      input.tx,
    )
    if (!current?.subcategoryId || current.categoryId === data.categoryId) {
      return data
    }
    if (data.categoryId) {
      const subcategory = await productCategoryRepository.find(
        {
          workspaceId: input.workspaceId,
          categoryId: current.subcategoryId,
        },
        input.tx,
      )
      if (subcategory?.parentId === data.categoryId) {
        return data
      }
    }
    return { ...data, subcategoryId: null }
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

  /**
   * The `vendorId` column a write should set: `undefined` leaves it alone,
   * `null` clears it. A vendor named by `vendor` is created when missing.
   */
  private async resolveVendorId(input: {
    workspaceId: string
    data: Pick<ProductWriteData, "vendor" | "vendorId">
    tx: DatabaseClient
  }): Promise<string | null | undefined> {
    const { workspaceId, data, tx } = input
    if (data.vendorId !== undefined) {
      if (data.vendorId) {
        await vendorService.assertBelongsToWorkspace({
          workspaceId,
          vendorId: data.vendorId,
          tx,
        })
      }
      return data.vendorId
    }
    if (data.vendor !== undefined) {
      return await vendorService.resolveName({
        workspaceId,
        name: data.vendor,
        tx,
      })
    }
    return
  }

  private async insert(
    data: ProductWriteData,
    tx: DatabaseClient,
  ): Promise<ProductModel> {
    const { images = [], vendor, vendorId, ...productData } = data
    const resolvedVendorId = await this.resolveVendorId({
      workspaceId: data.workspaceId,
      data: { vendor, vendorId },
      tx,
    })
    const product = await productRepository.create(
      {
        ...productData,
        vendorId: resolvedVendorId ?? null,
        images: toImageRows(images),
      },
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
    const { images, vendor, vendorId, ...productData } = input.data
    const resolvedVendorId = await this.resolveVendorId({
      workspaceId: input.workspaceId,
      data: { vendor, vendorId },
      tx: input.tx,
    })
    const updated = await productRepository.update(
      {
        workspaceId: input.workspaceId,
        productId: input.productId,
        // Absent images mean "leave them alone", not "clear them".
        values: {
          ...productData,
          ...(resolvedVendorId === undefined
            ? {}
            : { vendorId: resolvedVendorId }),
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
    const { productId, workspaceId, tx = db } = props
    const data = await this.withConsistentSubcategory({
      productId,
      workspaceId,
      data: props.data,
      tx,
    })
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
      ...patch
    } = input
    await db.transaction(async (tx) => {
      const data = await this.withConsistentSubcategory({
        productId,
        workspaceId,
        data: patch,
        tx,
      })
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
    const { ids, workspaceId } = input
    await assertDeletable({
      workspaceId,
      resourceKind: "product",
      resourceIds: ids,
    })
    const deleteWith = async (tx: DatabaseClient) => {
      // Discount codes keep product ids in a JSON list with no foreign key, so
      // the deleted ids have to be taken out here or the code can never be
      // edited again.
      await discountCodeRepository.removeProductIds(
        { workspaceId, productIds: ids },
        tx,
      )
      await productRepository.deleteByIds({ workspaceId, productIds: ids }, tx)
    }
    if (input.tx) {
      await deleteWith(input.tx)
      return
    }
    await db.transaction(deleteWith)
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

  /** Rows from a file import. Vendors are named, and created when missing. */
  async createFromImport(input: {
    workspaceId: string
    products: Array<
      Omit<ProductImportInsert, "vendorId"> & { vendor?: string | null }
    >
  }) {
    return await db.transaction(async (tx) => {
      const vendorIds = await vendorService.resolveByNames({
        workspaceId: input.workspaceId,
        names: input.products.flatMap((product) => product.vendor ?? []),
        createMissing: true,
        tx,
      })
      return await productRepository.createFromImport(
        {
          workspaceId: input.workspaceId,
          products: input.products.map(({ vendor, ...product }) => ({
            ...product,
            vendorId: vendor
              ? (vendorIds.get(vendor.trim().toLowerCase()) ?? null)
              : null,
          })),
        },
        tx,
      )
    })
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
