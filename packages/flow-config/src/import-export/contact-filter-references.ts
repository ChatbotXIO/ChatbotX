import { EXTERNAL_REFERENCE_KIND } from "./external-reference-kind"

/**
 * The entity a Condition row's `value` holds for each contact-filter `field`
 * whose value is an id rather than free text. A field absent from this map has
 * a plain value (a country, a date, a number) and is never rewritten.
 *
 * Lives here, not in `packages/database`, because `database` depends on
 * `flow-config`: `packages/database` pins this map against the real
 * `ContactFilterField` enum (`satisfies Partial<Record<ContactFilterField,
 * …>>`) and a test fails when an id-valued field is left out.
 *
 * The value is a string, a string array, or both (`eq`/`in`/`ne`/`notIn`), so
 * one rule covers every operator; `isEmpty` carries no value at all.
 */
export type ContactFilterFieldReference = {
  readonly kind: string
}

export const CONTACT_FILTER_FIELD_REFERENCE = {
  inbox: { kind: "inbox" },
  tags: { kind: "tag" },
  subscribedToDripCampaign: { kind: "sequence" },
  conversationAssigned: { kind: "workspaceMember" },
  entryPointsLinks: { kind: "reflink" },
  completedWhatsAppFlows: { kind: "whatsappFlow" },
  keywordsReceived: { kind: "automatedResponse" },
  executedFlow: { kind: "flow" },
  executedStep: { kind: "flowNode" },
  // Broadcasts are one-off sends that never travel with a template.
  broadcastSent: { kind: "broadcast" },
  broadcastDelivered: { kind: "broadcast" },
  broadcastSeen: { kind: "broadcast" },
  broadcastClicked: { kind: "broadcast" },
  broadcastFailed: { kind: "broadcast" },
  // Product ids: `boughtItems` and `shoppingCartContainsItems` take a string
  // or array of `Product` ids (`queries/contact-filter/commerce.ts`).
  boughtItems: { kind: "product" },
  shoppingCartContainsItems: { kind: "product" },
  // Third-party ids this product never owns.
  commentedOnPost: { kind: EXTERNAL_REFERENCE_KIND },
  clickedAd: { kind: EXTERNAL_REFERENCE_KIND },
  emailSent: { kind: EXTERNAL_REFERENCE_KIND },
  emailDelivered: { kind: EXTERNAL_REFERENCE_KIND },
  emailOpened: { kind: EXTERNAL_REFERENCE_KIND },
  emailClicked: { kind: EXTERNAL_REFERENCE_KIND },
} as const satisfies Readonly<Record<string, ContactFilterFieldReference>>

const NUMERIC_ID = /^\d+$/

const collectNumericStrings = (node: unknown, into: Set<string>): void => {
  if (typeof node === "string") {
    if (NUMERIC_ID.test(node)) {
      into.add(node)
    }
    return
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      collectNumericStrings(item, into)
    }
    return
  }
  if (node && typeof node === "object") {
    for (const child of Object.values(node)) {
      collectNumericStrings(child, into)
    }
  }
}

/**
 * Every id a stored contact filter `{ operator, conditions: [{ field, value }] }`
 * points at, with the kind of entity its `field` names. Shares
 * `CONTACT_FILTER_FIELD_REFERENCE` with the uninstall probe (which matches the
 * quoted ids inside the `value` of the same fields), so the write guard and
 * the probe cannot drift. Fields with a plain value are ignored; a malformed
 * filter yields nothing.
 */
export const contactFilterReferences = (
  filter: unknown,
): { kind: string; id: string }[] => {
  const conditions = (filter as { conditions?: unknown } | null)?.conditions
  if (!Array.isArray(conditions)) {
    return []
  }
  const found = new Map<string, { kind: string; id: string }>()
  for (const condition of conditions) {
    const { field, value } = (condition ?? {}) as {
      field?: unknown
      value?: unknown
    }
    const reference =
      typeof field === "string"
        ? (CONTACT_FILTER_FIELD_REFERENCE as Record<string, { kind: string }>)[
            field
          ]
        : undefined
    if (!reference) {
      continue
    }
    const ids = new Set<string>()
    collectNumericStrings(value, ids)
    for (const id of ids) {
      found.set(`${reference.kind}:${id}`, { kind: reference.kind, id })
    }
  }
  return [...found.values()]
}
