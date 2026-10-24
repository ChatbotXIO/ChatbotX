import { sql } from "drizzle-orm"
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type { CartLine } from "../partials/ecommerce"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { contactModel } from "./contact"
import { contactInboxModel } from "./contact-inbox"
import { workspaceModel } from "./workspace"

/**
 * A customer's cart, one per contact in a workspace, filled from the web shop
 * or from a cart sent through WhatsApp's catalog. It holds only what was
 * chosen: prices are read from the products when the order is placed. `items`
 * has no database default — every write sets it.
 */
export const cartModel = pgTable(
  "Cart",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigintAsString()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** The channel the cart last came from, so a reply goes back there. */
    contactInboxId: bigintAsString().references(() => contactInboxModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    items: jsonb().$type<CartLine[]>().notNull(),
    /** The discount code the customer entered; checked again at checkout. */
    discountCode: text(),
    /** Last change by the customer; the abandoned-cart reminder counts from it. */
    lastActivityAt: timestamp(timestampConfig).defaultNow().notNull(),
    abandonedNotifiedAt: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("Cart_workspaceId_contactId_key").on(
      table.workspaceId,
      table.contactId,
    ),
    index("Cart_contactId_idx").on(table.contactId),
    index("Cart_contactInboxId_idx").on(table.contactInboxId),
    // The abandoned-cart scan reads only carts not reminded yet.
    index("Cart_abandoned_scan_idx")
      .on(table.lastActivityAt)
      .where(sql`${table.abandonedNotifiedAt} IS NULL`),
  ],
)
