import { auditLogService } from "@chatbotx.io/business"
import { NextResponse } from "next/server"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

// Regex top-level (biome lint useTopLevelRegex).
const CSV_NEEDS_QUOTING = /[",\n\r]/
const CSV_QUOTE = /"/g

function escapeCsv(value: string | null | undefined): string {
  const s = (value ?? "").toString()
  if (CSV_NEEDS_QUOTING.test(s)) {
    return `"${s.replace(CSV_QUOTE, '""')}"`
  }
  return s
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const workspaceId = url.searchParams.get("workspaceId")
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 })
  }

  await assertCurrentUserCanAccessChatbot(workspaceId)

  const userId = url.searchParams.get("userId") || undefined
  const action = url.searchParams.get("action") || undefined

  const { data } = await auditLogService.listByWorkspaceId({
    workspaceId,
    userId,
    action,
    limit: 10_000,
    offset: 0,
  })

  const header = ["Data/Hora", "Ação", "Usuário", "Detalhe"]
  const lines = [header.join(",")]

  for (const row of data) {
    lines.push(
      [
        escapeCsv(new Date(row.createdAt).toISOString()),
        escapeCsv(row.action),
        escapeCsv(row.userId ?? "Sistema"),
        escapeCsv(row.detail),
      ].join(","),
    )
  }

  const csv = `﻿${lines.join("\n")}`

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-logs.csv"`,
    },
  })
}
