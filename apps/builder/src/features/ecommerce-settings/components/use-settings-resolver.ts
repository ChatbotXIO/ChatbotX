"use client"

import type { FieldValues } from "react-hook-form"
import {
  type FieldRule,
  useRequestResolver,
} from "@/lib/validation/use-request-resolver"
import {
  type UpdateEcommerceSettingsRequest,
  updateEcommerceSettingsPublicRequest,
} from "../schema/public"

/**
 * Checks one settings group with the update action's schema: the request is
 * `{ group: … }`, and its `group.field` problems land on the form's `field`.
 */
export function useSettingsResolver<Values extends FieldValues>(
  toRequest: (values: Values) => UpdateEcommerceSettingsRequest,
  rules?: (values: Values) => Array<FieldRule<Values> | false>,
) {
  return useRequestResolver<Values>({
    schema: updateEcommerceSettingsPublicRequest,
    toRequest,
    rules,
    fieldFor: (path) => path.split(".")[1],
  })
}
