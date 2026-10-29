import {
  placeCategoryRepository,
  placeLocationRepository,
} from "@chatbotx.io/database/repositories"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"
import { type NearestPlace, pickNearestPlace } from "./nearest"
import { buildGoogleMapsPreviewUrl } from "./preview-url"

export type PlaceLocationItem = {
  id: string
  name: string
  latitude: number
  longitude: number
  categoryId: string | null
  categoryName: string | null
  previewUrl: string
  createdAt: Date
  updatedAt: Date
}

type LocationRow = Omit<PlaceLocationItem, "previewUrl">

const toItem = (row: LocationRow): PlaceLocationItem => ({
  id: row.id,
  name: row.name,
  latitude: row.latitude,
  longitude: row.longitude,
  categoryId: row.categoryId,
  categoryName: row.categoryName,
  previewUrl: buildGoogleMapsPreviewUrl(row.latitude, row.longitude),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

const nameRequired = () =>
  new ChatbotXException(
    "Place location name is required",
    "placeLocationNameRequired",
  )

const normalizeName = (name: string): string => {
  const trimmed = name.trim()
  if (!trimmed) {
    throw nameRequired()
  }
  return trimmed
}

const locationNotFound = () => notFoundException("Place location not found")

class PlaceLocationService extends BaseService {
  async list(input: {
    workspaceId: string
    name?: string | null
    page?: number
    perPage?: number
  }): Promise<{ data: PlaceLocationItem[]; pageCount: number }> {
    const { data, pageCount } = await placeLocationRepository.list(input)
    return { data: data.map(toItem), pageCount }
  }

  async find(input: {
    workspaceId: string
    locationId: string
  }): Promise<PlaceLocationItem> {
    const row = await placeLocationRepository.find(input)
    if (!row) {
      throw locationNotFound()
    }
    return toItem(row)
  }

  async create(input: {
    workspaceId: string
    name: string
    latitude: number
    longitude: number
    categoryId?: string | null
  }): Promise<PlaceLocationItem> {
    const name = normalizeName(input.name)
    await this.assertCategory(input.workspaceId, input.categoryId)
    const created = await placeLocationRepository.create({
      workspaceId: input.workspaceId,
      name,
      latitude: input.latitude,
      longitude: input.longitude,
      categoryId: input.categoryId ?? null,
    })
    if (!created) {
      throw new Error("Failed to create place location")
    }
    await this.invalidate(input.workspaceId)
    return await this.find({
      workspaceId: input.workspaceId,
      locationId: created.id,
    })
  }

  async update(input: {
    workspaceId: string
    locationId: string
    data: {
      name?: string
      latitude?: number
      longitude?: number
      categoryId?: string | null
    }
  }): Promise<PlaceLocationItem> {
    const { name, latitude, longitude, categoryId } = input.data
    const values = {
      ...(name === undefined ? {} : { name: normalizeName(name) }),
      ...(latitude === undefined ? {} : { latitude }),
      ...(longitude === undefined ? {} : { longitude }),
      ...(categoryId === undefined ? {} : { categoryId }),
    }
    if (Object.keys(values).length === 0) {
      return await this.find(input)
    }
    await this.assertCategory(input.workspaceId, categoryId)
    const updated = await placeLocationRepository.update({
      workspaceId: input.workspaceId,
      locationId: input.locationId,
      values,
    })
    if (!updated) {
      throw locationNotFound()
    }
    await this.invalidate(input.workspaceId)
    return await this.find(input)
  }

  async delete(input: {
    workspaceId: string
    locationId: string
  }): Promise<void> {
    const row = await placeLocationRepository.delete(input)
    if (!row) {
      throw locationNotFound()
    }
    await this.invalidate(input.workspaceId)
  }

  /** The location closest to a point, in one category or all; null if none. */
  async findNearest(input: {
    workspaceId: string
    categoryId: string | null
    latitude: number
    longitude: number
  }): Promise<NearestPlace | null> {
    const places = await placeLocationRepository.listCoordinates({
      workspaceId: input.workspaceId,
      categoryId: input.categoryId,
    })
    return pickNearestPlace(input, places)
  }

  private async assertCategory(
    workspaceId: string,
    categoryId: string | null | undefined,
  ) {
    if (!categoryId) {
      return
    }
    const category = await placeCategoryRepository.find({
      workspaceId,
      categoryId,
    })
    if (!category) {
      throw notFoundException("Place category does not exist.")
    }
  }

  /** Category lists carry per-category location counts. */
  private async invalidate(workspaceId: string) {
    await this.invalidateCacheTags([
      `place-locations:${workspaceId}`,
      `place-categories:${workspaceId}`,
    ])
  }
}

export const placeLocationService = new PlaceLocationService()
