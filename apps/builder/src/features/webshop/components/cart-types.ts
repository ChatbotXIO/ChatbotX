import type { DiscountType, ShippingType } from "@chatbotx.io/database/partials"

export type CartLineView = {
  productId?: string | null
  variantId?: string | null
  name: string
  variantLabel?: string | null
  imageUrl?: string | null
  unitPrice: number
  quantity: number
  discountTotal: number
  lineTotal: number
}

export type CartData = {
  lines: CartLineView[]
  unavailable: Array<{
    productId: string
    variantId?: string | null
    quantity: number
    name: string | null
  }>
  totals: {
    subtotal: number
    discountTotal: number
    shippingTotal: number
    serviceFeeTotal: number
    taxTotal: number
    couponDiscount: number
    total: number
  }
  enteredDiscountCode: string | null
  discount: {
    code: string
    amount: number
    discountType: DiscountType
    automatic: boolean
  } | null
  /** Typed codes this cart could use, to pick from. */
  availableDiscounts: Array<{
    code: string
    discountType: DiscountType
    discountValue: number
    amount: number
    endsAt: Date | null
    /** Anything but `available` is shown greyed out and cannot be picked. */
    status: "available" | "expired" | "usedUp" | "notEligible"
  }>
  discountError: { code: string; data?: Record<string, string | number> } | null
  belowMinimum: number | null
  shippingType: ShippingType | null
}
