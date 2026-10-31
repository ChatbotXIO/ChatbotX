import type { PgColumn, PgTable } from "drizzle-orm/pg-core"
import { and, type DatabaseClient, db, eq, inArray } from "../../client"
import {
  decisionProfileModel,
  folderModel,
  inboxModel,
  integrationMessengerModel,
  integrationModel,
  integrationOpenaiCompatibleModel,
  integrationSmtpModel,
  integrationWhatsappModel,
  leaderboardModel,
  messengerMessageTemplateModel,
  miniAppModel,
  pipelineModel,
  placeCategoryModel,
  productCategoryModel,
  productModel,
  sequenceModel,
  spreadsheetModel,
  tagModel,
  userPersistentMenuModel,
  vendorModel,
  webhookModel,
  whatsappFlowModel,
  whatsappMessageTemplateModel,
} from "../../schema"

/** The two columns every verifiable table shares. */
type WorkspaceScopedTable = PgTable & {
  id: PgColumn
  workspaceId: PgColumn
}

const VERIFIABLE_REFERENCE_KINDS = [
  "inbox",
  "tag",
  "pipeline",
  "folder",
  "productCategory",
  "product",
  "vendor",
  "sequence",
  "miniApp",
  "leaderboard",
  "placeCategory",
  "webhook",
  "spreadsheet",
  "decisionProfile",
  "userPersistentMenu",
  "integration",
  "messengerPersona",
  "messengerTemplate",
  "whatsappTemplate",
  "whatsappFlow",
] as const

export type VerifiableReferenceKind =
  (typeof VERIFIABLE_REFERENCE_KINDS)[number]

/** Kinds backed by one table that carries `workspaceId` itself. */
type DirectReferenceKind = Exclude<
  VerifiableReferenceKind,
  | "integration"
  | "messengerPersona"
  | "messengerTemplate"
  | "whatsappTemplate"
  | "whatsappFlow"
>

export const isVerifiableReferenceKind = (
  kind: string,
): kind is VerifiableReferenceKind =>
  (VERIFIABLE_REFERENCE_KINDS as readonly string[]).includes(kind)

/**
 * Reference kind -> the table whose rows that kind's ids point at, for the
 * kinds whose table carries `workspaceId` itself. The rest are scoped through
 * their owning integration (see `findIntegrationScopedIds`). Built on call, not
 * at module load, so importing this repository never touches the schema (an
 * unrelated suite that mocks part of the schema stays unaffected).
 */
const workspaceTableForKind = (
  kind: DirectReferenceKind,
): WorkspaceScopedTable => {
  const tables = {
    inbox: inboxModel,
    tag: tagModel,
    pipeline: pipelineModel,
    folder: folderModel,
    productCategory: productCategoryModel,
    product: productModel,
    vendor: vendorModel,
    sequence: sequenceModel,
    miniApp: miniAppModel,
    leaderboard: leaderboardModel,
    placeCategory: placeCategoryModel,
    webhook: webhookModel,
    spreadsheet: spreadsheetModel,
    decisionProfile: decisionProfileModel,
    userPersistentMenu: userPersistentMenuModel,
  } as const satisfies Readonly<
    Record<DirectReferenceKind, WorkspaceScopedTable>
  >
  return tables[kind]
}

const idsIn = async (query: Promise<{ id: unknown }[]>): Promise<Set<string>> =>
  new Set((await query).map((row) => String(row.id)))

/**
 * Kinds whose rows have no `workspaceId` of their own: each is scoped by a join
 * to the integration that owns it, and that integration carries the workspace.
 * A row of another workspace's integration is therefore never reported as
 * existing. `integration` ids name rows of several tables (the base
 * `Integration`, SMTP, OpenAI-compatible, Messenger); ids are unique across
 * tables, so the union of the workspace's rows answers it. Personas live in the
 * Messenger integration's `personas` column, so they are matched in code over
 * that workspace's few integrations.
 */
const findIntegrationScopedIds = async (
  input: {
    workspaceId: string
    kind: Exclude<VerifiableReferenceKind, DirectReferenceKind>
    ids: readonly string[]
  },
  tx: DatabaseClient,
): Promise<Set<string>> => {
  const ids = [...input.ids]
  const { workspaceId } = input
  switch (input.kind) {
    case "messengerTemplate":
      return await idsIn(
        tx
          .select({ id: messengerMessageTemplateModel.id })
          .from(messengerMessageTemplateModel)
          .innerJoin(
            integrationMessengerModel,
            eq(
              messengerMessageTemplateModel.integrationMessengerId,
              integrationMessengerModel.id,
            ),
          )
          .where(
            and(
              eq(integrationMessengerModel.workspaceId, workspaceId),
              inArray(messengerMessageTemplateModel.id, ids),
            ),
          ),
      )
    case "whatsappTemplate":
      return await idsIn(
        tx
          .select({ id: whatsappMessageTemplateModel.id })
          .from(whatsappMessageTemplateModel)
          .innerJoin(
            integrationWhatsappModel,
            eq(
              whatsappMessageTemplateModel.integrationWhatsappId,
              integrationWhatsappModel.id,
            ),
          )
          .where(
            and(
              eq(integrationWhatsappModel.workspaceId, workspaceId),
              inArray(whatsappMessageTemplateModel.id, ids),
            ),
          ),
      )
    case "whatsappFlow":
      return await idsIn(
        tx
          .select({ id: whatsappFlowModel.id })
          .from(whatsappFlowModel)
          .innerJoin(
            integrationWhatsappModel,
            eq(
              whatsappFlowModel.integrationWhatsappId,
              integrationWhatsappModel.id,
            ),
          )
          .where(
            and(
              eq(integrationWhatsappModel.workspaceId, workspaceId),
              inArray(whatsappFlowModel.id, ids),
            ),
          ),
      )
    case "messengerPersona": {
      const rows = await tx
        .select({ personas: integrationMessengerModel.personas })
        .from(integrationMessengerModel)
        .where(eq(integrationMessengerModel.workspaceId, workspaceId))
      const wanted = new Set(ids)
      return new Set(
        rows
          .flatMap((row) => row.personas)
          .map((persona) => persona.id)
          .filter((id) => wanted.has(id)),
      )
    }
    case "integration": {
      const scoped = [
        integrationModel,
        integrationSmtpModel,
        integrationMessengerModel,
        integrationOpenaiCompatibleModel,
      ] as const
      const found = await Promise.all(
        scoped.map((table) =>
          idsIn(
            tx
              .select({ id: table.id })
              .from(table)
              .where(
                and(eq(table.workspaceId, workspaceId), inArray(table.id, ids)),
              ),
          ),
        ),
      )
      return new Set(found.flatMap((set) => [...set]))
    }
    default:
      return new Set()
  }
}

const isDirectKind = (
  kind: VerifiableReferenceKind,
): kind is DirectReferenceKind =>
  !(
    kind === "integration" ||
    kind === "messengerPersona" ||
    kind === "messengerTemplate" ||
    kind === "whatsappTemplate" ||
    kind === "whatsappFlow"
  )

export const referenceExistenceRepository = {
  /**
   * Which of `ids` exist as rows of `kind` in `workspaceId`: one query for the
   * whole id set. A file or payload is never trusted to say an id is valid.
   */
  async findExistingIds(
    input: {
      workspaceId: string
      kind: VerifiableReferenceKind
      ids: readonly string[]
    },
    tx: DatabaseClient = db,
  ): Promise<Set<string>> {
    if (input.ids.length === 0) {
      return new Set()
    }
    if (!isDirectKind(input.kind)) {
      return await findIntegrationScopedIds({ ...input, kind: input.kind }, tx)
    }
    const table = workspaceTableForKind(input.kind)
    const rows = await tx
      .select({ id: table.id })
      .from(table)
      .where(
        and(
          eq(table.workspaceId, input.workspaceId),
          inArray(table.id, [...input.ids]),
        ),
      )
    return new Set(rows.map((row) => String(row.id)))
  },
}
