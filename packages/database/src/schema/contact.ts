import { sql } from "drizzle-orm"
import {
  type AnyPgColumn,
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { genderTypes } from "../partials"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { userModel } from "./auth-user"
import { lifecycleStageModel } from "./lifecycle-stage"
import { workspaceModel } from "./workspace"

export const gender = pgEnum(
  "gender",
  genderTypes.options as [string, ...string[]],
)

export const contactModel = pgTable(
  "Contact",
  {
    ...sharedColumns,
    avatar: text(),
    phoneNumber: text(),
    email: text(),
    emailVerified: boolean().default(false).notNull(),
    emailOptIn: boolean().default(false).notNull(),
    firstName: text(),
    lastName: text(),
    fullName: text().generatedAlwaysAs(sql`"firstName" || ' ' || "lastName"`),
    gender: gender(),
    lastReadAt: timestamp(timestampConfig),
    ref: text(),
    country: text(),
    state: text(),
    city: text(),
    location: jsonb().$type<{
      latitude: number
      longitude: number
    }>(),
    locale: text(),
    timezone: text(),
    subscribedAt: timestamp(timestampConfig),
    blockedAt: timestamp(timestampConfig),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    lifecycleStageId: bigintAsString().references(
      () => lifecycleStageModel.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    lastActivityAt: timestamp(timestampConfig).defaultNow().notNull(),
    // Soft-delete pra suportar Unmerge (#17 — 2026-05-27). Quando um
    // contato é fundido em outro, em vez de DELETE marca-se mergedIntoId
    // = id do primary + mergedAt = now() + mergedByUserId. Todas as
    // queries de listagem filtram WHERE mergedIntoId IS NULL. Reverter
    // a fusão é só UPDATE setando os 3 campos pra NULL — mas movimentos
    // de conversations/tags/customFields NÃO são revertidos automatic.
    // FK referencia o próprio Contact via lambda (self-reference). ON
    // DELETE SET NULL: se primary for hard-deletado, duplicates voltam
    // a aparecer (preferível a perder histórico).
    // Self-reference: `AnyPgColumn` quebra a circularidade de tipos —
    // sem isso TypeScript infere contactModel como `any` e propaga erros
    // em todas as relations que referenciam contactModel.
    mergedIntoId: bigintAsString().references(
      (): AnyPgColumn => contactModel.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    mergedAt: timestamp(timestampConfig),
    mergedByUserId: bigintAsString().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => [
    // Acelera lookups "contatos fundidos em X" (UI banner no primary).
    index("Contact_mergedIntoId_idx").on(table.mergedIntoId),
  ],
)
