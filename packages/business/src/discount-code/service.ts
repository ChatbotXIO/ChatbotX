import {
  type DatabaseClient,
  isUniqueViolationError,
} from "@chatbotx.io/database/client"
import type {
  DiscountAppliesTo,
  DiscountCustomerFilter,
  DiscountEligibility,
  DiscountMinimumType,
  DiscountType,
  ShippingType,
} from "@chatbotx.io/database/partials"
import {
  type DiscountCodeListInput,
  type DiscountCodeWriteValues,
  discountCodeRepository,
  productCategoryRepository,
  productRepository,
} from "@chatbotx.io/database/repositories"
import type { DiscountCodeModel } from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"
import { contactService } from "../contact/service"
import {
  ChatbotXException,
  notFoundException,
  validationException,
} from "../errors"
import { assertReferencable } from "../template/installed-resource.service"
import { withTemplateLockedTransaction } from "../template/template-resource-locks"
import { contactFilterParentsOf } from "../template/uninstall-references"
import {
  discountCodeAlreadyUsedException,
  discountCodeDuplicatedException,
  discountCodeNotEligibleException,
  discountCodeNotFoundException,
  discountCodeUsageLimitReachedException,
} from "./errors"
import {
  assertCouponUsable,
  type CouponLine,
  computeCouponDiscount,
} from "./pricing"

/** Everything the coupon form and API set. */
export type DiscountCodeInput = {
  code: string
  autoApply: boolean
  discountType: DiscountType
  discountValue: number
  appliesTo: DiscountAppliesTo
  categoryId: string | null
  productIds: string[]
  minimumType: DiscountMinimumType
  minimumValue: number
  usageLimit: number | null
  oncePerCustomer: boolean
  eligibility: DiscountEligibility
  customerFilter: DiscountCustomerFilter | null
  startsAt: Date
  endsAt: Date | null
  isActive: boolean
}

/** The order a code is priced against. */
export type DiscountOrderContext = {
  workspaceId: string
  contactId: string | null
  lines: CouponLine[]
  shippingType: ShippingType | null
  shippingTotal: number
  currency: string
}

export type AppliedDiscount = {
  discountCode: DiscountCodeModel
  amount: number
}

/**
 * Whether a code the cart lists can be picked: `expired` (its end date
 * passed), `usedUp` (no uses left, or this customer's one use spent) and
 * `notEligible` (for customers matching a filter this one does not) are
 * shown greyed out.
 */
export type AvailableDiscountStatus =
  | "available"
  | "expired"
  | "usedUp"
  | "notEligible"

/** A code the cart offers the customer, with what it would take off. */
export type AvailableDiscount = {
  code: string
  discountType: DiscountType
  discountValue: number
  /** What it takes off this order; 0 unless `available`. */
  amount: number
  /** Null never ends. */
  endsAt: Date | null
  status: AvailableDiscountStatus
}

/** The refusals that keep a listed code on the cart, greyed out. */
const UNAVAILABLE_STATUS_BY_ERROR: Partial<
  Record<string, Exclude<AvailableDiscountStatus, "available">>
> = {
  discountCodeExpired: "expired",
  discountCodeUsageLimitReached: "usedUp",
  discountCodeAlreadyUsed: "usedUp",
  discountCodeNotEligible: "notEligible",
}

/** Enough to choose from without crowding the cart. */
const MAX_OFFERED_CODES = 20

const endTime = (discount: AvailableDiscount) =>
  discount.endsAt?.getTime() ?? Number.POSITIVE_INFINITY

/**
 * Usable codes first — most taken off, then soonest to end — and the
 * greyed-out ones after, latest ended first.
 */
const compareListedDiscounts = (a: AvailableDiscount, b: AvailableDiscount) => {
  const aUsable = a.status === "available"
  const bUsable = b.status === "available"
  if (aUsable !== bUsable) {
    return aUsable ? -1 : 1
  }
  if (aUsable) {
    return b.amount - a.amount || endTime(a) - endTime(b)
  }
  return endTime(b) - endTime(a)
}

const CODE_PATTERN = /^[A-Za-z0-9_-]{3,64}$/
// No 0/O or 1/I/l, so a code read aloud or off a screen is typed right.
const GENERATED_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
const GENERATED_LENGTH = 8

/** Web Crypto, so the business barrel stays Edge-safe (no `node:crypto`). */
const randomCode = (): string => {
  const bytes = crypto.getRandomValues(new Uint32Array(GENERATED_LENGTH))
  return Array.from(
    bytes,
    (value) => GENERATED_ALPHABET[value % GENERATED_ALPHABET.length],
  ).join("")
}

/** Clears the fields a choice leaves unused, so a stored code reads one way. */
const normalize = (input: DiscountCodeInput): DiscountCodeWriteValues => {
  const freeShipping = input.discountType === "freeShipping"
  const appliesTo: DiscountAppliesTo = freeShipping
    ? "entireOrder"
    : input.appliesTo
  return {
    code: input.code.trim(),
    autoApply: input.autoApply,
    discountType: input.discountType,
    discountValue: freeShipping ? 0 : input.discountValue,
    appliesTo,
    categoryId: appliesTo === "category" ? input.categoryId : null,
    productIds:
      appliesTo === "products" ? Array.from(new Set(input.productIds)) : [],
    minimumType: input.minimumType,
    minimumValue: input.minimumType === "none" ? 0 : input.minimumValue,
    usageLimit: input.usageLimit,
    oncePerCustomer: input.oncePerCustomer,
    eligibility: input.eligibility,
    customerFilter:
      input.eligibility === "specificCustomers" ? input.customerFilter : null,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    isActive: input.isActive,
  }
}

const toInput = (row: DiscountCodeModel): DiscountCodeInput => ({
  code: row.code,
  autoApply: row.autoApply,
  discountType: row.discountType,
  discountValue: row.discountValue,
  appliesTo: row.appliesTo,
  categoryId: row.categoryId,
  productIds: row.productIds,
  minimumType: row.minimumType,
  minimumValue: row.minimumValue,
  usageLimit: row.usageLimit,
  oncePerCustomer: row.oncePerCustomer,
  eligibility: row.eligibility,
  customerFilter: row.customerFilter,
  startsAt: row.startsAt,
  endsAt: row.endsAt,
  isActive: row.isActive,
})

/**
 * Discount codes ("Coupons"): what they take off an order, and the one
 * place a use is counted. Pricing a code never writes anything; `redeem`
 * runs inside the order's transaction after `resolve` with `lock`.
 */
class DiscountCodeService extends BaseService {
  async list(input: DiscountCodeListInput) {
    return await discountCodeRepository.list(input)
  }

  async get(input: { workspaceId: string; discountCodeId: string }) {
    const row = await discountCodeRepository.find(input)
    if (!row) {
      throw notFoundException("Discount code does not exist.")
    }
    return row
  }

  /** A random code that is not taken in this workspace yet. */
  async generateCode(workspaceId: string) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = randomCode()
      if (!(await discountCodeRepository.findByCode({ workspaceId, code }))) {
        return code
      }
    }
    throw new ChatbotXException(
      "Could not generate a free code.",
      "systemError",
      500,
    )
  }

  async create(input: DiscountCodeInput & { workspaceId: string }) {
    const values = normalize(input)
    await this.assertValid(input.workspaceId, values)
    try {
      const row = await withTemplateLockedTransaction(async (tx) => {
        await assertReferencable({
          workspaceId: input.workspaceId,
          parents: contactFilterParentsOf(values.customerFilter),
          tx,
        })
        return await discountCodeRepository.create(
          { ...values, workspaceId: input.workspaceId },
          tx,
        )
      })
      if (!row) {
        throw new Error("Failed to create the discount code")
      }
      return row
    } catch (error) {
      if (isUniqueViolationError(error)) {
        throw discountCodeDuplicatedException()
      }
      throw error
    }
  }

  /** A partial change, checked as the whole code it produces. */
  async update(input: {
    workspaceId: string
    discountCodeId: string
    data: Partial<DiscountCodeInput>
  }) {
    const current = await this.get(input)
    const merged = { ...toInput(current), ...input.data }
    // Products deleted since the last save are dropped quietly when the caller
    // does not send a product list, so an unrelated edit is not refused.
    if (
      input.data.productIds === undefined &&
      merged.appliesTo === "products" &&
      merged.productIds.length > 0
    ) {
      const stillThere = await productRepository.findForOrder({
        workspaceId: input.workspaceId,
        productIds: merged.productIds,
      })
      const existingIds = new Set(stillThere.map((product) => product.id))
      merged.productIds = merged.productIds.filter((id) => existingIds.has(id))
    }
    const values = normalize(merged)
    await this.assertValid(input.workspaceId, values, current.usedCount)
    try {
      const row = await withTemplateLockedTransaction(async (tx) => {
        await assertReferencable({
          workspaceId: input.workspaceId,
          parents: contactFilterParentsOf(values.customerFilter),
          tx,
        })
        return await discountCodeRepository.update(
          {
            workspaceId: input.workspaceId,
            discountCodeId: input.discountCodeId,
            values,
          },
          tx,
        )
      })
      if (!row) {
        throw notFoundException("Discount code does not exist.")
      }
      return row
    } catch (error) {
      if (isUniqueViolationError(error)) {
        throw discountCodeDuplicatedException()
      }
      throw error
    }
  }

  async setActive(input: {
    workspaceId: string
    discountCodeId: string
    isActive: boolean
  }) {
    // A code switched off because its products or category were deleted
    // applies to nothing — it is fixed through `update` before it can be on.
    if (input.isActive) {
      const current = await this.get(input)
      await this.assertValid(
        input.workspaceId,
        normalize(toInput(current)),
        current.usedCount,
      )
    }
    const row = await discountCodeRepository.update({
      workspaceId: input.workspaceId,
      discountCodeId: input.discountCodeId,
      values: { isActive: input.isActive },
    })
    if (!row) {
      throw notFoundException("Discount code does not exist.")
    }
    return row
  }

  /** Placed orders keep the code they used, as text. */
  async delete(input: { workspaceId: string; discountCodeId: string }) {
    const row = await discountCodeRepository.delete(input)
    if (!row) {
      throw notFoundException("Discount code does not exist.")
    }
    return row
  }

  /**
   * The code to apply to an order and what it takes off: the one the
   * customer typed (`code`, which must be usable or this throws), else — with
   * `autoApply` — the automatic code that takes off the most, or null. With
   * `tx`, the chosen code is locked and checked again, so `redeem` in the
   * same transaction counts a use that is still there.
   */
  async resolve(
    order: DiscountOrderContext & {
      code?: string | null
      autoApply?: boolean
      tx?: DatabaseClient
      now?: Date
    },
  ): Promise<AppliedDiscount | null> {
    const now = order.now ?? new Date()
    const typed = order.code?.trim()
    if (typed) {
      const found = await discountCodeRepository.findByCode(
        { workspaceId: order.workspaceId, code: typed },
        order.tx,
      )
      if (!found) {
        throw discountCodeNotFoundException()
      }
      return await this.price(found, order, now)
    }
    if (!order.autoApply) {
      return null
    }
    const candidates = await discountCodeRepository.listAutoApply(
      { workspaceId: order.workspaceId, now },
      order.tx,
    )
    const priced: AppliedDiscount[] = []
    for (const candidate of candidates) {
      const applied = await this.price(
        candidate,
        { ...order, tx: undefined },
        now,
      ).catch((error: unknown) => {
        if (error instanceof ChatbotXException) {
          return null
        }
        throw error
      })
      if (applied && applied.amount > 0) {
        priced.push(applied)
      }
    }
    priced.sort((a, b) => b.amount - a.amount)
    // Checked again under the lock: the best one may have been used up.
    for (const best of priced) {
      if (!order.tx) {
        return best
      }
      const applied = await this.price(best.discountCode, order, now).catch(
        (error: unknown) => {
          if (error instanceof ChatbotXException) {
            return null
          }
          throw error
        },
      )
      if (applied) {
        return applied
      }
    }
    return null
  }

  /**
   * The typed codes the cart lists (see `discountCodeRepository.listOffered`),
   * each priced against this order. An ended, used-up or not-for-this-customer
   * code stays, marked `expired` / `usedUp` / `notEligible`; one that would
   * take nothing off or does not fit the order otherwise is left out. Usable codes first, most taken off first,
   * then soonest to end; the greyed-out ones after, latest ended first.
   */
  async listAvailable(
    order: DiscountOrderContext & { now?: Date },
  ): Promise<AvailableDiscount[]> {
    const now = order.now ?? new Date()
    const candidates = await discountCodeRepository.listOffered({
      workspaceId: order.workspaceId,
      now,
      limit: MAX_OFFERED_CODES,
    })
    const listed: AvailableDiscount[] = []
    for (const candidate of candidates) {
      const listing = {
        code: candidate.code,
        discountType: candidate.discountType,
        discountValue: candidate.discountValue,
        endsAt: candidate.endsAt,
      }
      const applied = await this.price(candidate, order, now).catch(
        (error: unknown) => {
          if (error instanceof ChatbotXException) {
            return UNAVAILABLE_STATUS_BY_ERROR[error.code] ?? null
          }
          throw error
        },
      )
      if (typeof applied === "string") {
        listed.push({ ...listing, amount: 0, status: applied })
      } else if (applied && applied.amount > 0) {
        listed.push({ ...listing, amount: applied.amount, status: "available" })
      }
    }
    return listed.sort(compareListedDiscounts)
  }

  /** Counts the use for the order; call after `resolve` in the same `tx`. */
  async redeem(
    input: {
      workspaceId: string
      orderId: string
      contactId: string | null
      applied: AppliedDiscount
    },
    tx: DatabaseClient,
  ) {
    const counted = await discountCodeRepository.incrementUsed(
      input.applied.discountCode.id,
      tx,
    )
    if (!counted) {
      throw discountCodeUsageLimitReachedException()
    }
    await discountCodeRepository.insertRedemption(
      {
        workspaceId: input.workspaceId,
        discountCodeId: input.applied.discountCode.id,
        orderId: input.orderId,
        contactId: input.contactId,
        amount: input.applied.amount,
      },
      tx,
    )
  }

  /** Gives a cancelled or deleted order's use back. */
  async release(
    input: { workspaceId: string; orderId: string },
    tx: DatabaseClient,
  ) {
    const redemption = await discountCodeRepository.deleteRedemptionByOrder(
      input,
      tx,
    )
    if (redemption) {
      await discountCodeRepository.decrementUsed(redemption.discountCodeId, tx)
    }
  }

  /** What `code` takes off the order, or why it cannot be used. */
  private async price(
    code: DiscountCodeModel,
    order: DiscountOrderContext & { tx?: DatabaseClient },
    now: Date,
  ): Promise<AppliedDiscount> {
    const current = order.tx
      ? await discountCodeRepository.lock(
          { workspaceId: order.workspaceId, discountCodeId: code.id },
          order.tx,
        )
      : code
    if (!current) {
      throw discountCodeNotFoundException()
    }
    assertCouponUsable(current, now)
    await this.assertEligible(current, order)
    const amount = computeCouponDiscount(current, order)
    return { discountCode: current, amount }
  }

  /** "Customer eligibility" and "one use per customer". */
  private async assertEligible(
    code: DiscountCodeModel,
    order: DiscountOrderContext & { tx?: DatabaseClient },
  ) {
    const needsContact =
      code.eligibility === "specificCustomers" || code.oncePerCustomer
    if (!needsContact) {
      return
    }
    if (!order.contactId) {
      throw discountCodeNotEligibleException()
    }
    if (code.eligibility === "specificCustomers") {
      const matches =
        code.customerFilter !== null &&
        (await contactService.matchesContactFilter({
          workspaceId: order.workspaceId,
          contactId: order.contactId,
          contactFilter: code.customerFilter,
        }))
      if (!matches) {
        throw discountCodeNotEligibleException()
      }
    }
    if (code.oncePerCustomer) {
      const used = await discountCodeRepository.countRedemptions(
        { discountCodeId: code.id, contactId: order.contactId },
        order.tx,
      )
      if (used > 0) {
        throw discountCodeAlreadyUsedException()
      }
    }
  }

  private async assertValid(
    workspaceId: string,
    values: DiscountCodeWriteValues,
    usedCount = 0,
  ) {
    if (!CODE_PATTERN.test(values.code)) {
      throw validationException(
        "code",
        "A code is 3–64 letters, digits, - or _.",
      )
    }
    const discountValue = values.discountValue ?? 0
    if (
      values.discountType === "percentage" &&
      !(discountValue > 0 && discountValue <= 100)
    ) {
      throw validationException(
        "discountValue",
        "A percentage is more than 0 and at most 100.",
      )
    }
    if (values.discountType === "fixedAmount" && !(discountValue > 0)) {
      throw validationException("discountValue", "An amount is more than 0.")
    }
    if (values.appliesTo === "category") {
      const category = values.categoryId
        ? await productCategoryRepository.find({
            workspaceId,
            categoryId: values.categoryId,
          })
        : undefined
      if (!category) {
        throw validationException(
          "categoryId",
          "Choose a category of this workspace.",
        )
      }
    }
    if (values.appliesTo === "products") {
      const productIds = values.productIds ?? []
      const found = await productRepository.findForOrder({
        workspaceId,
        productIds,
      })
      if (productIds.length === 0 || found.length !== productIds.length) {
        throw validationException(
          "productIds",
          "Choose products of this workspace.",
        )
      }
    }
    const minimumValue = values.minimumValue ?? 0
    if (values.minimumType !== "none" && !(minimumValue > 0)) {
      throw validationException("minimumValue", "A minimum is more than 0.")
    }
    if (values.minimumType === "quantity" && !Number.isInteger(minimumValue)) {
      throw validationException(
        "minimumValue",
        "A minimum number of items is a whole number.",
      )
    }
    if (values.usageLimit !== null && values.usageLimit !== undefined) {
      if (!(Number.isInteger(values.usageLimit) && values.usageLimit >= 1)) {
        throw validationException(
          "usageLimit",
          "A usage limit is a whole number from 1.",
        )
      }
      if (values.usageLimit < usedCount) {
        throw validationException(
          "usageLimit",
          `This code was already used ${usedCount} times.`,
        )
      }
    }
    if (
      values.eligibility === "specificCustomers" &&
      !values.customerFilter?.conditions.length
    ) {
      throw validationException("customerFilter", "Add at least one condition.")
    }
    if (values.endsAt && values.startsAt && values.endsAt <= values.startsAt) {
      throw validationException(
        "endsAt",
        "The end date is after the start date.",
      )
    }
  }
}

export const discountCodeService = new DiscountCodeService()
