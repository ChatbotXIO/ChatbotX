# Shopify store source

A workspace's ecommerce can mirror a Shopify store instead of managing its own
catalog. Products, variants, stock, discount codes and orders come from
Shopify; the web shop (`/shop/{workspaceId}`), carts, triggers, analytics and
the public API keep working on the mirrored rows.

## Store source

`EcommerceSettings.storeSource` is `chatbotx` (the default, our own catalog)
or `shopify`. Every catalog row carries the source it came from
(`Product`, `ProductCategory`, `Vendor`, `DiscountCode` — `source`, plus
`externalId` where Shopify has an id), and every list shows only the rows of the
current source:

- `resolveStoreSource` (`packages/business/src/ecommerce-settings/store-source.ts`)
  reads it, cached under the settings tag. It lives apart from
  `ecommerceSettingsService` so the catalog services do not import the settings
  validation (and the flow service behind it).
- Product, category, vendor and discount-code repositories take an optional
  `source` (ours when left out); their services pass the current one.
- `orderService.list` without a `source` filter shows `shopify` orders in
  Shopify mode and every other source otherwise.

Switching back and forth hides rows; it never deletes them. Disconnecting
Shopify switches the store back to `chatbotx`.

Mirrored rows are read-only here (`shopifyManaged`, 409): creating or editing a
product, category, vendor or code while in Shopify mode, and moving or deleting
a Shopify order. A product's `status` follows Shopify and cannot be changed
here; a category's `isVisible` and a vendor's `isActive` stay ours — they
decide what our web shop shows. The guards
on categories, vendors and codes only run in Shopify mode; in our own mode the
Shopify rows are not listed at all.

## Connecting

`shopifyIntegrationService.connect` (`packages/business/src/shopify/integration.service.ts`),
behind `shopify.connect` and the Settings → Shopify form, accepts two kinds of
Shopify app:

| `authKind` | App | Stored |
|---|---|---|
| `token` | A custom app created in the store admin (before Shopify stopped allowing new ones in January 2026) | Admin API access token (`shpat_…`) and the app's API secret key |
| `clientCredentials` | An app from Shopify's Dev Dashboard installed on the store | Client ID and Client Secret; a 24-hour access token is requested with the client credentials grant and renewed under a Redis lock when it is about to expire |

The secret is encrypted on `IntegrationShopify.encryptedAuth` with
`shopify:{workspaceId}` as AAD. The app's API secret key (or client secret)
also verifies webhooks, so it is required in both cases.

Required scopes: `read_products, read_inventory, read_orders, write_orders,
read_customers, read_discounts, read_fulfillments` (`SHOPIFY_REQUIRED_SCOPES`).
`write_orders` is only for In-App Checkout. `read_orders` reaches the last 60
days of orders, which is what a full sync pulls.

Connect checks the credentials (`shop` query), subscribes
`/api/shopify/{workspaceId}/webhook` to every topic in
`SHOPIFY_WEBHOOK_TOPICS`, saves the row (one per workspace, replacing the old
connection and removing its subscriptions) and queues a full sync. Disconnect
and workspace purge remove the subscriptions best effort
(`disconnectWorkspaceIntegrations` lists `shopify`).

## Sync

The integration queue carries two jobs (`apps/worker/src/integration/handlers/shopify/`),
both under `withBlockedOwnerGuard`:

- `shopifySync` — `shopifySyncService.run`: products (with options, variants and
  per-variant stock), code discounts, then orders created in the last 60 days.
  `IntegrationShopify.syncStatus` is claimed before queueing, so only one runs;
  one older than 30 minutes is treated as dead. Shopify refusing the
  credentials (401) marks the connection `invalid` instead of retrying; a
  missing scope or protected customer data (403, `ACCESS_DENIED`) fails the
  sync but leaves the connection active.
- `shopifyWebhook` — one per delivery (`X-Shopify-Webhook-Id`). The route checks
  the HMAC (Web Crypto, Edge-safe) and the shop domain, then the job reads the
  object back from Shopify by its GID, so late or reordered deliveries still
  write the current state.

Mapping (`packages/business/src/shopify/mappers.ts`):

- Product type → category, vendor → vendor, both matched by name within the
  `shopify` source. Shopify's status goes to `Product.status`: `ACTIVE` →
  `active`, `UNLISTED` → `unlisted`, `DRAFT`/`ARCHIVED` (and any status Shopify
  adds later) → `draft`. A sync is its only writer. The web shop, product
  messages, the Meta catalog and orders take a product only when it is
  `active`; `unlisted` is hidden like `draft`. The products table shows a
  Shopify product's status as a label instead of the on/off switch our own
  products keep (`products.setActive` refuses a Shopify product).
- Options and variants map one to one; variants keep their ids across syncs
  (matched by `ProductVariant.externalId`), so carts stay valid. A product sold
  without options keeps no variants; its one Shopify variant is
  `Product.externalVariantId`.
- Code discounts that our cart can price (percentage, fixed amount or free
  shipping, on everything or on listed products) become `DiscountCode` rows;
  others (collections, buy X get Y, app discounts) are left out and still work
  when typed on Shopify's checkout.

## Orders

`orderService.syncExternal` writes a Shopify order by `Order.externalId`:
created the first time (with our own order number, `externalName` such as
`#1004`), updated after. No stock, redemption or payment page is touched.

| Shopify | Our status |
|---|---|
| cancelled | `cancelled` |
| fulfilled and a fulfillment delivered | `concluded` |
| fulfilled | `shipped` |
| paid (or partially refunded / refunded) | `accepted` |
| otherwise | `pending` |

Statuses only move forward (`nextMirroredStatus`); a finished order stays
finished. With `announce`, a new order is announced like one placed here
(`newOrder`, `productOrdered`, the confirmation message), a move fires its
event and status message, and a payment fires `orderPaid` — so the Ecommerce
trigger events work unchanged. Who announces:

- webhooks (`orders/create`, `orders/updated`) — only while `storeSource` is
  `shopify`;
- the In-App checkout — always;
- the full sync — never: the 60 days of history it pulls (and any order a
  webhook missed) is written silently, so connecting a store does not message
  customers about old orders.

When the In-App checkout and the `orders/create` webhook create the same order
at once, the loser of the `Order_workspaceId_externalId_key` race writes again
as an update instead of failing.

The contact is found from the `cbx_ref` note attribute — a signed shop token
(30 days) our checkout stamps on the cart permalink or on `orderCreate` — or
else an existing contact with exactly the order's email (lowercased) or phone
(normalized to E.164 in the shipping country, as contacts store it). An order
placed by someone we never talked to has no contact and fires no trigger.
A Web Checkout order from a shop link also empties those lines from the
customer's cart when it arrives.

## Checkout

`webshopService.checkout` branches on `checkout.shopifyCheckoutMethod`:

- `webCheckout` — returns a cart permalink
  (`https://{shop}/cart/{variant}:{qty},…?checkout[email]=…&discount=…&attributes[cbx_ref]=…`)
  as `paymentUrl`; Shopify computes shipping and takes payment. The order
  arrives through `orders/create`.
- `inApp` — calls `orderCreate` (cash on delivery, `DECREMENT_OBEYING_POLICY`
  stock), mirrors the returned order at once and takes the lines out of the
  cart. The delivery line is `shipping.deliveryCost`; a free-text state goes
  into the note because Shopify takes a province code.

`checkout.shopifyAutoApplyDiscounts` off hides discount codes in the cart and
passes none to Shopify. `checkout.checkoutMode` does not apply to a Shopify
store (its settings hide it), so an `externalLink` left from before the switch
does not block checkout.

## Public API

`shopify.getStatus`, `shopify.connect`, `shopify.sync`, `shopify.disconnect`
(scope `ecommerce`); `ecommerceSettings.update` for `storeSource`,
`shopifyCheckoutMethod`, `shopifyAutoApplyDiscounts`; `orders.list` filters
`paymentStatus` and `fulfillmentStatus`; `orders.export` returns the CSV the
Orders page downloads.

## Troubleshooting

- **Sync `failed` with an access error** — the app lacks a scope; add it in
  Shopify, reinstall, and Sync Now.
- **Connection `invalid`** — the app was uninstalled or the token revoked;
  connect again.
- **Orders arrive without a contact** — the customer opened Shopify's
  storefront directly rather than our shop link, and no contact has their email
  or phone.
- **Webhooks answer 401** — the API secret key (or client secret) saved does not
  belong to the app that registered them; connect again with the right one.
