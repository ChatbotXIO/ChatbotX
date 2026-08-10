import { workspaceService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import {
  buildContactsImportTemplateCsv,
  CONTACTS_IMPORT_TEMPLATE_FILENAME,
} from "@/features/contacts/lib/contacts-import-template"
import { requireContactsAccess } from "@/lib/auth/require-workspace-permission"

export const runtime = "nodejs"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    notFound()
  }

  // Throws (renders 404) when the caller lacks contacts access.
  await requireContactsAccess(workspaceId)

  const workspace = await workspaceService.findById({ id: workspaceId })
  const csv = buildContactsImportTemplateCsv(workspace.language)

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${CONTACTS_IMPORT_TEMPLATE_FILENAME}"`,
      "Cache-Control": "no-store",
    },
  })
}
