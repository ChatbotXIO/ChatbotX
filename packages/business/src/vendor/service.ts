import {
  type DatabaseClient,
  db,
  isUniqueViolationError,
} from "@chatbotx.io/database/client"
import {
  productCategoryRepository,
  type VendorListInput,
  vendorRepository,
} from "@chatbotx.io/database/repositories"
import { BaseService } from "../base.service"
import { ecommerceOpenHoursService } from "../ecommerce-open-hours/service"
import { ChatbotXException, notFoundException } from "../errors"

const normalizeVendorName = (name: string): string => name.trim()

const vendorNameRequired = () =>
  new ChatbotXException("Vendor name is required", "productVendorNameRequired")

const vendorDuplicated = () =>
  new ChatbotXException("Vendor already exists", "productVendorDuplicated")

export type VendorWriteData = {
  name: string
  shortDescription?: string | null
  phone?: string | null
  storeAddress?: string | null
  imageUrl?: string | null
  isActive?: boolean
  /** 0–100, on top of each product's own discount. */
  discountPercent?: number
  minimumOrderValue?: number
  openHoursId?: string | null
  categoryId?: string | null
  subcategoryId?: string | null
  rank?: number
}

class VendorService extends BaseService {
  /** All vendors, or one page filtered by name. */
  async list(input: VendorListInput) {
    return await vendorRepository.listWithProductCount(input)
  }

  async listOptions(workspaceId: string) {
    return await vendorRepository.listOptions(workspaceId)
  }

  async create(input: VendorWriteData & { workspaceId: string }) {
    const name = normalizeVendorName(input.name)
    if (!name) {
      throw vendorNameRequired()
    }
    await this.assertReferences(input.workspaceId, input)
    try {
      const row = await vendorRepository.create({ ...input, name })
      if (!row) {
        throw new Error("Failed to create vendor")
      }
      await this.invalidateCacheTags(this.cacheTag(input.workspaceId))
      return row
    } catch (error) {
      if (isUniqueViolationError(error)) {
        throw vendorDuplicated()
      }
      throw error
    }
  }

  async update(input: {
    workspaceId: string
    vendorId: string
    data: Partial<VendorWriteData>
  }) {
    const name =
      input.data.name === undefined
        ? undefined
        : normalizeVendorName(input.data.name)
    if (name === "") {
      throw vendorNameRequired()
    }
    await this.assertReferences(input.workspaceId, input.data)
    try {
      const row = await vendorRepository.update({
        workspaceId: input.workspaceId,
        vendorId: input.vendorId,
        values: { ...input.data, ...(name === undefined ? {} : { name }) },
      })
      if (!row) {
        throw notFoundException("Vendor not found")
      }
      await this.invalidateCacheTags(this.cacheTag(input.workspaceId))
      return row
    } catch (error) {
      if (isUniqueViolationError(error)) {
        throw vendorDuplicated()
      }
      throw error
    }
  }

  /** Products of the vendor stay; they just lose their vendor. */
  async delete(input: { workspaceId: string; vendorId: string }) {
    const row = await vendorRepository.delete(input)
    if (!row) {
      throw notFoundException("Vendor not found")
    }
    await this.invalidateCacheTags(this.cacheTag(input.workspaceId))
  }

  /** Throws unless the vendor exists in this workspace. */
  async assertBelongsToWorkspace(input: {
    workspaceId: string
    vendorId: string
    tx?: DatabaseClient
  }) {
    const row = await vendorRepository.find(
      { workspaceId: input.workspaceId, vendorId: input.vendorId },
      input.tx,
    )
    if (!row) {
      throw notFoundException("Vendor does not exist.")
    }
    return row
  }

  /**
   * Vendor ids for names, matched without regard to case or surrounding
   * spaces. Importers and the legacy `vendor` field on the product API name a
   * vendor rather than pick one; `createMissing` creates the ones that do not
   * exist yet. The map is keyed by the lower-cased trimmed name.
   */
  async resolveByNames(input: {
    workspaceId: string
    names: string[]
    createMissing: boolean
    tx?: DatabaseClient
  }): Promise<Map<string, string>> {
    const { tx = db } = input
    const names = Array.from(
      new Set(input.names.map(normalizeVendorName).filter(Boolean)),
    )
    if (names.length === 0) {
      return new Map()
    }
    if (input.createMissing) {
      await vendorRepository.createMissing(
        { workspaceId: input.workspaceId, names },
        tx,
      )
      await this.invalidateCacheTags(this.cacheTag(input.workspaceId))
    }
    const rows = await vendorRepository.findByNames(
      { workspaceId: input.workspaceId, names },
      tx,
    )
    return new Map(rows.map((row) => [row.name.toLowerCase(), row.id]))
  }

  /** One vendor name to its id, creating it when missing. Null stays null. */
  async resolveName(input: {
    workspaceId: string
    name: string | null
    tx?: DatabaseClient
  }): Promise<string | null> {
    const name = input.name ? normalizeVendorName(input.name) : ""
    if (!name) {
      return null
    }
    const ids = await this.resolveByNames({
      workspaceId: input.workspaceId,
      names: [name],
      createMissing: true,
      tx: input.tx,
    })
    return ids.get(name.toLowerCase()) ?? null
  }

  /** The schedule and categories a vendor points at live in its workspace. */
  private async assertReferences(
    workspaceId: string,
    data: Partial<VendorWriteData>,
  ) {
    if (data.openHoursId) {
      await ecommerceOpenHoursService.assertBelongsToWorkspace({
        workspaceId,
        openHoursId: data.openHoursId,
      })
    }
    for (const categoryId of [data.categoryId, data.subcategoryId]) {
      if (!categoryId) {
        continue
      }
      const category = await productCategoryRepository.find({
        workspaceId,
        categoryId,
      })
      if (!category) {
        throw notFoundException("Product category does not exist.")
      }
    }
    if (data.subcategoryId && data.categoryId) {
      const subcategory = await productCategoryRepository.find({
        workspaceId,
        categoryId: data.subcategoryId,
      })
      if (subcategory?.parentId !== data.categoryId) {
        throw notFoundException(
          "Product sub-category does not belong to the selected category.",
        )
      }
    }
  }

  private cacheTag(workspaceId: string) {
    return `product-vendors:${workspaceId}`
  }
}

export const vendorService = new VendorService()
