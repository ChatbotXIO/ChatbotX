import { z } from "zod"

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const getEcommerceAnalyticsPublicRequest = z.object({
  from: z
    .string()
    .regex(DAY_PATTERN)
    .optional()
    .describe(
      "First day, `YYYY-MM-DD` in the workspace timezone. Defaults to today.",
    ),
  to: z
    .string()
    .regex(DAY_PATTERN)
    .optional()
    .describe("Last day, inclusive. Defaults to `from`."),
})

const stat = z.object({
  value: z.number(),
  change: z
    .number()
    .nullable()
    .describe(
      "Percent change against the period of the same length just before; null when that period had none.",
    ),
})

export const ecommerceAnalyticsResource = z.object({
  currency: z
    .string()
    .describe("Store currency; orders in another currency are not counted."),
  from: z.string(),
  to: z.string(),
  timezone: z.string().describe("The workspace timezone the days are in."),
  granularity: z
    .enum(["hour", "day"])
    .describe("`hour` for a one-day range, `day` otherwise."),
  lifetime: stat.describe(
    "All sales so far; `change` is what this period added to the sales before it.",
  ),
  sales: stat.describe("Sum of order totals in the period."),
  orders: stat.describe("Orders placed in the period."),
  products: stat.describe("Items sold in the period."),
  series: z
    .array(
      z.object({
        key: z
          .string()
          .describe("`YYYY-MM-DDTHH` (hour) or `YYYY-MM-DD` (day)."),
        sales: z.number(),
        orders: z.number(),
      }),
    )
    .describe(
      "Every hour or day of the period, including those without orders.",
    ),
  topProducts: z
    .array(
      z.object({
        productId: z
          .string()
          .nullable()
          .describe("Null when the product was deleted."),
        name: z.string(),
        quantity: z.number(),
        sales: z.number(),
      }),
    )
    .describe("Up to 10, by sales."),
  topVendors: z
    .array(
      z.object({
        vendorId: z.string().nullable(),
        name: z.string(),
        sales: z.number(),
      }),
    )
    .describe("Up to 10, by sales."),
})
export type EcommerceAnalyticsResource = z.infer<
  typeof ecommerceAnalyticsResource
>
