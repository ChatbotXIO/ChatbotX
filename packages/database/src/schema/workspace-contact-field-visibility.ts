import { pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

/**
 * Visibilidade dos Campos de Contato no painel direito do Inbox.
 *
 * Pedro 2026-05-25 (iteração 33): match Respond.io.
 *   - "Personalizar visualização" em Settings → Campos de contatos
 *     deixa user esconder/mostrar cada field
 *   - Hidden fields aparecem dentro do accordion "Campos de contato
 *     ocultos" no drawer do contato
 *   - Config é workspace-level (afeta TODOS os usuários — confirmado
 *     na própria UI do Respond.io: "Essa alteração será aplicada a
 *     todos os usuários no espaço de trabalho.")
 *
 * Default: tudo `showAlways`. Por isso só os hidden são gravados aqui
 * — economiza linhas. Ausência de registro = `showAlways`.
 */
export const contactFieldVisibilityType = pgEnum("contactFieldVisibility", [
  "showAlways",
  "alwaysHide",
] as [string, ...string[]])

export const workspaceContactFieldVisibilityModel = pgTable(
  "WorkspaceContactFieldVisibility",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // Pra sistema fields: "phoneNumber" / "firstName" / "lastName" /
    // "email" / "language" / "countryCode" / "profilePic" / "tags".
    // Pra custom fields: stringified customField.id (bigint).
    // Mantemos como text genérico — não há FK pra customField pq
    // a mesma coluna serve pros dois tipos. Quando o customField é
    // deletado, fica linha órfã (limpeza em cron ou ao listar
    // hidden filtra contra customFields existentes).
    fieldKey: text().notNull(),
    visibility: contactFieldVisibilityType()
      .$type<"showAlways" | "alwaysHide">()
      .notNull()
      .default("showAlways"),
  },
  (table) => [
    uniqueIndex(
      "WorkspaceContactFieldVisibility_workspaceId_fieldKey_key",
    ).using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.fieldKey.asc().nullsLast(),
    ),
  ],
)
