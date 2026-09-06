import {
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { contactModel } from "./contact"
import { contactInboxModel } from "./contact-inbox"
import { minigameModel } from "./minigame"

/**
 * Tracks each contact's remaining plays for a minigame. Reading/writing
 * `remaining`/`played` and applying `playerSettings.resetPolicy` lives in
 * `MinigameContactService` (`packages/business/src/minigame`).
 *
 * `referrerContactId` is stamped once, on this row's INSERT, from the
 * `mg_<minigameId>_<referrerContactId>` ref the invitee carried into the
 * channel (e.g. `m.me/<pageId>?ref=…`). That "only on insert" rule is what
 * enforces "this invitee had never opened this minigame before". The
 * referrer is credited when the invitee's inbound message reaches `runRef`
 * — i.e. on arrival, not on their first play; see
 * `MinigameContactService.creditSharedLinkReferral`.
 *
 * The ref is NOT signed and is fully attacker-controllable: anyone can hand
 * a webhook an arbitrary referrer id. What bounds the damage is the credit
 * path, not the value's provenance — `runRef` rejects a minigame belonging
 * to another workspace, the self-referral guard drops
 * `referrerContactId === contactId`, and `grantReferralBonus` enforces
 * `playerSettings.maxSharesPerPerson` inside its UPDATE's WHERE.
 */
export const minigameContactModel = pgTable(
  "MinigameContact",
  {
    ...sharedColumns,
    minigameId: bigintAsString()
      .notNull()
      .references(() => minigameModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigintAsString()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    openedAt: timestamp(timestampConfig).notNull(),
    played: integer().default(0).notNull(),
    remaining: integer().default(0).notNull(),
    // Qualified referrals credited to this contact for this minigame: a
    // friend who arrived via this contact's invite link and messaged the
    // channel, becoming a Contact. Doubles as the bonus-draw
    // ledger — each credit grants +1 `remaining`, and under
    // `resetPolicy: "never"` the derivation in `resolvePlayState` treats
    // `drawsPerPerson + min(sharesCount, cap) - played` as the live
    // remaining, which is what keeps a granted bonus from being re-derived
    // away. Never incremented past `playerSettings.maxSharesPerPerson`, so
    // this is *credited* referrals; the raw per-edge ledger is
    // `referrerContactId` on the invitees' own rows.
    sharesCount: integer().default(0).notNull(),
    referrerContactId: bigintAsString().references(() => contactModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // The specific ContactInbox the contact used to open/play this minigame,
    // known exactly from the play token payload — lets conversation lookups
    // (e.g. jumping to this player's chat from the history table) target the
    // exact conversation via Message.contactInboxId instead of guessing by
    // channel, which is ambiguous for channels that key non-DM conversations
    // (comment threads) with the same non-null sourceId convention.
    contactInboxId: bigintAsString().references(() => contactInboxModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => [
    index("MinigameContact_minigameId_idx").using(
      "btree",
      table.minigameId.asc().nullsLast(),
    ),
    index("MinigameContact_contactId_idx").using(
      "btree",
      table.contactId.asc().nullsLast(),
    ),
    uniqueIndex("MinigameContact_minigameId_contactId_key").using(
      "btree",
      table.minigameId.asc().nullsLast(),
      table.contactId.asc().nullsLast(),
    ),
  ],
)
