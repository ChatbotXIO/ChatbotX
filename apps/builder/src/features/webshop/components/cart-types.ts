import type { ShippingType } from "@chatbotx.io/database/partials"

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
  discount: { code: string; amount: number; automatic: boolean } | null
  discountError: { code: string; data?: Record<string, string | number> } | null
  belowMinimum: number | null
  shippingType: ShippingType | null
}
