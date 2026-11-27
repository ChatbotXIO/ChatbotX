import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type { CredentialEncrypted } from "../partials/credential"
import {
  type OnlinePaymentProvider,
  type OrderPaymentStatus,
  onlinePaymentProviders,
  orderPaymentStatuses,
} from "../partials/ecommerce"
import {
  bigintAsString,
  money,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { orderModel } from "./order"
import { platformCredentialModel } from "./platform-credential"
import { workspaceModel } from "./workspace"

export const onlinePaymentProvider = pgEnum(
  "onlinePaymentProvider",
  onlinePaymentProviders.options as [
    OnlinePaymentProvider,
    ...OnlinePaymentProvider[],
  ],
)
export const orderPaymentStatus = pgEnum(
  "orderPaymentStatus",
  orderPaymentStatuses.options as [OrderPaymentStatus, ...OrderPaymentStatus[]],
)

/**
 * The store's own Stripe or PayPal account, one per provider per workspace.
 *
 * - Stripe is connected through Stripe Connect OAuth: only the account id
 *   (`acct_…`) is kept, and every call uses the platform's key
 *   (`platformCredentialId`) on behalf of that account.
 * - PayPal keeps the store's Client ID, Secret and webhook id in `secret`,
 *   encrypted with the workspace and provider as AAD; nothing ever reads it
 *   back out to a client.
 */
export const ecommercePaymentProviderModel = pgTable(
  "EcommercePaymentProvider",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    provider: onlinePaymentProvider().notNull(),
    /** False for a Stripe test connection and the PayPal sandbox. */
    livemode: boolean().notNull(),
    /** The account's name or email, shown on the settings page. */
    accountLabel: text(),
    /** The store's Stripe account (`acct_…`); null for PayPal. */
    externalAccountId: text(),
    /**
     * The platform Stripe credential the account was connected with. Null for
     * PayPal, or once that credential is deleted (the store reconnects).
     */
    platformCredentialId: bigintAsString().references(
      () => platformCredentialModel.id,
      { onDelete: "set null", onUpdate: "cascade" },
    ),
    /** PayPal only: the store's keys and webhook id, encrypted. */
    secret: jsonb().$type<CredentialEncrypted>(),
    /** PayPal only: the webhook PayPal calls us on, removed on disconnect. */
    webhookEndpointId: text(),
  },
  (table) => [
    uniqueIndex("EcommercePaymentProvider_workspaceId_provider_key").on(
      table.workspaceId,
      table.provider,
    ),
    // Disconnecting a Stripe account cuts every workspace using it, so one
    // account belongs to one workspace per platform credential.
    uniqueIndex("EcommercePaymentProvider_platformCredentialId_account_key")
      .on(table.platformCredentialId, table.externalAccountId)
      .where(sql`${table.externalAccountId} IS NOT NULL`),
    index("EcommercePaymentProvider_externalAccountId_idx").on(
      table.externalAccountId,
    ),
  ],
)

/**
 * One attempt to pay an order online: a Stripe Checkout Session or a PayPal
 * order. `(provider, providerReference)` is unique, so a webhook delivered
 * twice finds the same row.
 */
export const orderPaymentModel = pgTable(
  "OrderPayment",
  {
    ...sharedColumns,
    orderId: bigintAsString()
      .notNull()
      .references(() => orderModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    provider: onlinePaymentProvider().notNull(),
    /** The Checkout Session id (Stripe) or the order id (PayPal). */
    providerReference: text().notNull(),
    /** The payment intent (Stripe) or capture id (PayPal); refunds use it. */
    transactionId: text(),
    refundId: text(),
    /** What was asked of the customer, in the order's currency. */
    amount: money().notNull(),
    currency: text().notNull(),
    status: orderPaymentStatus().default("open").notNull(),
    livemode: boolean().notNull(),
    checkoutUrl: text().notNull(),
    expiresAt: timestamp(timestampConfig).notNull(),
    paidAt: timestamp(timestampConfig),
    refundedAt: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("OrderPayment_provider_providerReference_key").on(
      table.provider,
      table.providerReference,
    ),
    index("OrderPayment_orderId_idx").on(table.orderId),
    index("OrderPayment_workspaceId_idx").on(table.workspaceId),
    // The sweep that settles open attempts past their page's end.
    index("OrderPayment_open_expiresAt_idx")
      .on(table.expiresAt)
      .where(sql`${table.status} = 'open'`),
  ],
)
