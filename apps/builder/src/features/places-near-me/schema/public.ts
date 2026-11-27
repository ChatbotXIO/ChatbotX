import { zodBigintIdAsString } from "@chatbotx.io/utils"
import { z } from "zod"

const atLeastOneField = (value: Record<string, unknown>) =>
  Object.entries(value).some(([key, v]) => key !== "id" && v !== undefined)
const atLeastOneFieldMessage = {
  message: "Send at least one field to update.",
}

export const MAX_RANK = 2_147_483_647

export const placeCategoryFormRequest = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .describe("Category name. Unique per workspace, ignoring case."),
  rank: z
    .number()
    .int()
    .min(1)
    .max(MAX_RANK)
    .optional()
    .describe("Priority, from 1. Lower is higher priority. Defaults to 10."),
})

export const placeLocationFormRequest = z.object({
  name: z.string().trim().min(1).max(255).describe("Location name."),
  latitude: z
    .number()
    .min(-90)
    .max(90)
    .describe("Latitude in degrees, -90 to 90, as a JSON number."),
  longitude: z
    .number()
    .min(-180)
    .max(180)
    .describe("Longitude in degrees, -180 to 180, as a JSON number."),
  categoryId: zodBigintIdAsString()
    .nullish()
    .describe(
      "Category id, or null for none. Get it from `placeCategories.list`.",
    ),
})

export const placeCategoryWriteResource = z.object({
  id: z.string(),
  name: z.string(),
  rank: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const placeCategoryResource = placeCategoryWriteResource.extend({
  locationCount: z.number().describe("Locations in this category."),
})

export const listPlaceCategoriesPublicResponse = z.object({
  data: z.array(placeCategoryResource),
})

const categoryIdInput = z.object({
  id: zodBigintIdAsString().describe(
    "Category id. Get it from `placeCategories.list`.",
  ),
})
export const placeCategoryIdPublicRequest = categoryIdInput

export const createPlaceCategoryPublicRequest = placeCategoryFormRequest

export const updatePlaceCategoryPublicRequest = placeCategoryFormRequest
  .partial()
  .extend(categoryIdInput.shape)
  .refine(atLeastOneField, atLeastOneFieldMessage)

export const deletePlaceCategoryPublicResponse = z.object({
  uncategorizedLocationCount: z
    .number()
    .describe(
      "Locations kept and now uncategorized because their category was deleted.",
    ),
})

export const placeLocationResource = z.object({
  id: z.string(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  categoryId: z.string().nullable(),
  categoryName: z.string().nullable(),
  previewUrl: z
    .string()
    .describe(
      "Google Maps link the UI's Preview button opens for this location.",
    ),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const listPlaceLocationsPublicRequest = z.object({
  name: z
    .string()
    .trim()
    .max(255)
    .optional()
    .describe("Only locations whose name contains this, ignoring case."),
  page: z.coerce.number().int().min(1).optional().describe("Page, from 1."),
  perPage: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Locations per page, 1 to 50. Omit both for every location."),
})

export const listPlaceLocationsPublicResponse = z.object({
  data: z.array(placeLocationResource),
  pageCount: z.number(),
})

export const placeLocationIdPublicRequest = z.object({
  id: zodBigintIdAsString().describe(
    "Location id. Get it from `placeLocations.list`.",
  ),
})

export const createPlaceLocationPublicRequest = placeLocationFormRequest

export const updatePlaceLocationPublicRequest = placeLocationFormRequest
  .partial()
  .extend(placeLocationIdPublicRequest.shape)
  .refine(atLeastOneField, atLeastOneFieldMessage)
