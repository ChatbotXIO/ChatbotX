"use server"

import { auditLogActions, logAudit } from "@chatbotx.io/business"
import { db, findOrFail } from "@chatbotx.io/database/client"
import { channelTypes, contactSources } from "@chatbotx.io/database/partials"
import {
  contactCustomFieldModel,
  contactInboxModel,
  contactModel,
  inboxModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { randomString } from "remeda"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type ImportContactsRequest,
  importContactsRequest,
} from "../schemas/action"

// MVP inline (até 500 rows). Pra batches maiores, mover pra worker job
// (`@chatbotx.io/worker-config` IntegrationJobAction.importContacts).
const MAX_IMPORT_ROWS = 500

// Regex top-level (regra biome useTopLevelRegex).
const CSV_LINE_SPLIT = /\r?\n/

/**
 * Parser CSV simples — handle aspas duplas e escape "". Quebra linhas por
 * \r\n ou \n. Não usa lib pra evitar dep nova. Suficiente pra CSV bem-formado
 * exportado de Excel/Sheets.
 *
 * NÃO suporta multilinha dentro de campo. Suficiente pro MVP do import.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  const lines = text.split(CSV_LINE_SPLIT)
  for (const line of lines) {
    if (!line.trim()) {
      continue
    }
    const cells: string[] = []
    let cur = ""
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"'
          i++
        } else if (ch === '"') {
          inQuotes = false
        } else {
          cur += ch
        }
      } else if (ch === '"') {
        inQuotes = true
      } else if (ch === ",") {
        cells.push(cur)
        cur = ""
      } else {
        cur += ch
      }
    }
    cells.push(cur)
    rows.push(cells.map((c) => c.trim()))
  }
  return rows
}

// E.164 simplificado: começa com + e tem 8-15 dígitos.
const E164_RE = /^\+\d{8,15}$/

type ImportResult = {
  imported: number
  skipped: number
  errors: { row: number; reason: string }[]
}

export const importContactsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(importContactsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
      ctx: { user },
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: ImportContactsRequest
      ctx: { user: { id: string } }
    }): Promise<ImportResult> => {
      const text = await parsedInput.file.text()
      const rows = parseCsv(text)

      if (rows.length < 2) {
        return {
          imported: 0,
          skipped: 0,
          errors: [{ row: 0, reason: "CSV vazio ou sem header" }],
        }
      }

      const headers = rows[0]
      const dataRows = rows.slice(1, 1 + MAX_IMPORT_ROWS)

      // Resolver índices das colunas pelo nome enviado no parsedInput.
      const colIdx = (name: string | undefined): number =>
        name
          ? headers.findIndex((h) => h.toLowerCase() === name.toLowerCase())
          : -1

      const phoneIdx = colIdx(parsedInput.phoneNumber)
      const emailIdx = colIdx(parsedInput.email)
      const firstNameIdx = colIdx(parsedInput.firstName)
      const lastNameIdx = colIdx(parsedInput.lastName)

      // fieldMapping é List<{column, customFieldId}> — converte pra Map idx → customFieldId
      const customFieldByIdx = new Map<number, string>()
      for (const m of parsedInput.fieldMapping ?? []) {
        const idx = headers.findIndex(
          (h) => h.toLowerCase() === m.column.toLowerCase(),
        )
        if (idx >= 0) {
          customFieldByIdx.set(idx, m.customFieldId)
        }
      }

      // Inbox webchat default — match padrão do createContact
      const inbox = await findOrFail({
        table: inboxModel,
        where: { workspaceId, channel: channelTypes.enum.webchat },
        message: "Webchat inbox not found",
      })

      const result: ImportResult = { imported: 0, skipped: 0, errors: [] }
      const seenInThisBatch = new Set<string>() // dedup intra-batch por phone

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i]
        const rowNumber = i + 2 // 1-indexed + header

        const phoneNumber = phoneIdx >= 0 ? (row[phoneIdx] || "").trim() : ""
        const email = emailIdx >= 0 ? (row[emailIdx] || "").trim() : ""
        const firstName =
          firstNameIdx >= 0 ? (row[firstNameIdx] || "").trim() : ""
        const lastName = lastNameIdx >= 0 ? (row[lastNameIdx] || "").trim() : ""

        // Phone obrigatório E.164 — ChatbotX usa phone como identificador único
        if (!phoneNumber) {
          result.errors.push({ row: rowNumber, reason: "phoneNumber vazio" })
          continue
        }
        if (!E164_RE.test(phoneNumber)) {
          result.errors.push({
            row: rowNumber,
            reason: `phoneNumber inválido (precisa formato E.164 +xxx): "${phoneNumber}"`,
          })
          continue
        }

        if (seenInThisBatch.has(phoneNumber)) {
          result.skipped++
          continue
        }
        seenInThisBatch.add(phoneNumber)

        // Dedup com DB — skip se phoneNumber já existe no workspace
        const existing = await db.query.contactModel.findFirst({
          columns: { id: true },
          where: { workspaceId, phoneNumber },
        })
        if (existing) {
          result.skipped++
          continue
        }

        // Insert contact + contactInbox em transaction
        try {
          await db.transaction(async (tx) => {
            const [newContact] = await tx
              .insert(contactModel)
              .values({
                id: createId(),
                workspaceId,
                phoneNumber,
                email: email || null,
                firstName: firstName || null,
                lastName: lastName || null,
              })
              .returning()

            await tx.insert(contactInboxModel).values({
              originalContactId: newContact.id,
              contactId: newContact.id,
              inboxId: inbox.id,
              channel: channelTypes.enum.webchat,
              source: contactSources.enum.imported,
              sourceId: `${randomString()}${createId()}`,
            })

            // Custom fields
            for (const [idx, customFieldId] of customFieldByIdx.entries()) {
              const value = (row[idx] || "").trim()
              if (!value) {
                continue
              }
              await tx
                .insert(contactCustomFieldModel)
                .values({
                  contactId: newContact.id,
                  customFieldId,
                  value,
                })
                .onConflictDoNothing()
            }
          })
          result.imported++
        } catch (err) {
          result.errors.push({
            row: rowNumber,
            reason: err instanceof Error ? err.message : "Falha no insert",
          })
        }
      }

      if (rows.length - 1 > MAX_IMPORT_ROWS) {
        result.errors.push({
          row: MAX_IMPORT_ROWS + 1,
          reason: `Apenas as primeiras ${MAX_IMPORT_ROWS} linhas foram importadas. Total de linhas no CSV: ${rows.length - 1}.`,
        })
      }

      await logAudit({
        workspaceId,
        userId: user.id,
        action: auditLogActions.CONTACT_IMPORTED,
        detail: `${result.imported} contato(s) importado(s), ${result.skipped} pulado(s), ${result.errors.length} erro(s) (CSV "${parsedInput.file.name}")`,
      })

      revalidateCacheTags([
        `workspaces:${workspaceId}#contacts`,
        `workspaces:${workspaceId}#conversations`,
      ])

      return result
    },
  )
