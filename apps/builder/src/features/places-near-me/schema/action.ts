import { z } from "zod"
import {
  MAX_RANK,
  placeCategoryFormRequest,
  placeLocationFormRequest,
} from "./public"

/** Form inputs hand back `""` for an emptied box; the row stores null. */
const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value

/** The RankSelectField yields a string, so coerce it to a number. */
export const placeCategoryFormSchema = placeCategoryFormRequest.extend({
  rank: z.coerce.number().int().min(1).max(MAX_RANK).optional(),
})
export type PlaceCategoryForm = z.input<typeof placeCategoryFormSchema>

export const placeLocationFormSchema = placeLocationFormRequest.extend({
  categoryId: z.preprocess(
    emptyToNull,
    placeLocationFormRequest.shape.categoryId,
  ),
})
export type PlaceLocationForm = z.input<typeof placeLocationFormSchema>
