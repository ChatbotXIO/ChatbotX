import { index, pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { contactModel } from "./contact"
import { workspaceModel } from "./workspace"

export const errorLogModel = pgTable(
  "ErrorLog",
  {
    ...sharedColumns,
    /**
     * The failing third party, one value from `errorLogProviders`. Not an
     * operation name and not an error message.
     */
    action: text().notNull(),
    detail: text().notNull(),
    httpCode: text(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigintAsString().references(() => contactModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /**
     * The contact's channel-side id, mirroring `ContactInbox.sourceId` (a
     * Messenger PSID, an IGSID, a WhatsApp `wa_id`). NOT the provider *message*
     * id — that is what `Message.sourceId` and `messageAction.sourceId` mean.
     *
     * Exists because `contactId` is null exactly where it matters most: the
     * contact row does not exist yet (a creation-path `getProfile` failure, a
     * Lead Ads lead), and this is then the only thing identifying who the
     * failure concerned.
     *
     * Deliberately no FK: `ContactInbox.sourceId` is unique only per `inboxId`,
     * so there is no column to reference — and an FK would defeat the purpose,
     * since the row must survive when no `ContactInbox` exists at all.
     *
     * Write-only today: no read surface renders it (the builder table shows
     * `contactId` only), the list's keyword search skips it, and the
     * `analytics`-scoped public route strips it from the response and refuses
     * to sort by it. Anything that starts reading it needs an index — there is
     * none below — and has to re-answer the scope question the public route
     * settled.
     */
    sourceId: text(),
    /**
     * The frame lines of the thrown value's stack, message prefix stripped and
     * capped at 2048 characters. `NULL` whenever no real stack existed: the
     * thrown value was not an `Error`, or its `stack` carried no frames.
     *
     * The producer derives the frames from the value it was handed, so a path
     * that parses its throw away before logging must capture them itself and
     * pass them in — the outbound-send path does exactly that, emitting
     * `errorStack` on `message:failed` because `recordProviderErrorLog` later
     * sees only a stackless `ParsedError` off a Redis stream. A provider's
     * async delivery-status callback still writes `NULL` here: the send left
     * this worker long ago and no stack in this process points at it.
     *
     * Developer-only, and withheld more strictly than `sourceId`: it is never
     * SELECTed by the builder's list query, omitted from both the internal and
     * the public response schemas, and not sortable. It leaks absolute server
     * paths and our internal call chain, so it must never reach a workspace
     * user — read it from the database directly.
     *
     * No index: write-only. Anything that starts reading it needs one, and has
     * to re-answer the exposure question this comment settles.
     */
    stackTrace: text(),
  },
  (table) => [
    // Serves the workspace error-log list: filter by workspace, newest first.
    index("ErrorLog_workspaceId_createdAt_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.createdAt.desc().nullsFirst(),
    ),
    // Serves the `purgeErrorLogs` retention cron's age scan.
    index("ErrorLog_createdAt_idx").using(
      "btree",
      table.createdAt.asc().nullsLast(),
    ),
    // Serves the `onDelete: "set null"` FK scan Postgres runs on every
    // `Contact` delete. Every comparable contactId FK in the schema is indexed.
    index("ErrorLog_contactId_idx").on(table.contactId),
  ],
)
