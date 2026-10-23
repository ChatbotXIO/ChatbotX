import { sql } from "drizzle-orm"
import {
  check,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
} from "drizzle-orm/pg-core"
import {
  CONTACT_ACTIVITY_ALLOWED_PAIRS,
  type ContactActivityReferenceType,
  type ContactActivityType,
  contactActivityReferenceTypes,
  contactActivityTypes,
  UNSCOPED_PARENT_REFERENCE_ID,
} from "../partials/contact-activity"
import { bigintAsString, timestampConfig } from "../partials/shared"

export const contactActivityTypeEnum = pgEnum(
  "contactActivityType",
  contactActivityTypes.options as [
    ContactActivityType,
    ...ContactActivityType[],
  ],
)

export const contactActivityReferenceTypeEnum = pgEnum(
  "contactActivityReferenceType",
  contactActivityReferenceTypes.options as [
    ContactActivityReferenceType,
    ...ContactActivityReferenceType[],
  ],
)

// Built from the registry's own constants (enum literals and ids), never from
// request input, so the raw fragment cannot carry user data.
const allowedPairsCondition = sql.raw(
  CONTACT_ACTIVITY_ALLOWED_PAIRS.map(
    (pair) =>
      `("activityType" = '${pair.activityType}' AND "referenceType" = '${pair.referenceType}' AND "parentReferenceId" ${
        pair.parentScoped ? "<>" : "="
      } ${UNSCOPED_PARENT_REFERENCE_ID})`,
  ).join(" OR "),
)

// Partitioned by HASH(workspaceId) in its migration, with no FKs, like
// ContactInboxPost: a single-column cascade would probe every partition.
// Contact deletion and workspace purge remove rows explicitly. One row means
// "this contact ever did this" — the primary key is the idempotency key.
export const contactActivityModel = pgTable(
  "ContactActivity",
  {
    workspaceId: bigintAsString().notNull(),
    contactId: bigintAsString().notNull(),
    activityType: contactActivityTypeEnum().notNull(),
    referenceType: contactActivityReferenceTypeEnum().notNull(),
    // Parent entity id (the flow of a flow node); UNSCOPED_PARENT_REFERENCE_ID otherwise.
    parentReferenceId: bigintAsString().notNull(),
    // Referenced entity id; NO_REFERENCE_ID when the activity has no reference.
    referenceId: bigintAsString().notNull(),
    // Producer event time, not processing time.
    firstOccurredAt: timestamp(timestampConfig).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.workspaceId,
        table.contactId,
        table.activityType,
        table.referenceType,
        table.parentReferenceId,
        table.referenceId,
      ],
      name: "ContactActivity_pkey",
    }),
    index("ContactActivity_reference_idx").on(
      table.workspaceId,
      table.activityType,
      table.referenceType,
      table.parentReferenceId,
      table.referenceId,
      table.contactId,
    ),
    check("ContactActivity_allowed_pair_check", allowedPairsCondition),
  ],
)
