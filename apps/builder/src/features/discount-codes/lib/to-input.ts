import type { DiscountCodeInput } from "@chatbotx.io/business"
import type { DiscountCodeWriteRequest } from "../schema/public"

/** A full form or API body as the service takes it. */
export const toDiscountCodeInput = (
  request: DiscountCodeWriteRequest,
): DiscountCodeInput => ({
  ...request,
  categoryId: request.categoryId ?? null,
  usageLimit: request.usageLimit ?? null,
  customerFilter: request.customerFilter ?? null,
  startsAt: request.startsAt ?? new Date(),
  endsAt: request.endsAt ?? null,
})

/** A partial update: only the fields sent, with `null` kept as a clear. */
export const toDiscountCodePatch = (
  request: Partial<DiscountCodeWriteRequest>,
): Partial<DiscountCodeInput> => {
  const patch: Partial<DiscountCodeInput> = {}
  for (const [key, value] of Object.entries(request)) {
    if (value !== undefined) {
      Object.assign(patch, { [key]: value })
    }
  }
  return patch
}
