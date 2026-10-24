import type { z } from "zod"
import type {
  listOrdersPublicResponse,
  publicOrderListItemResource,
} from "./public"

export type OrderListItem = z.infer<typeof publicOrderListItemResource>
export type OrderListResponse = z.infer<typeof listOrdersPublicResponse>
