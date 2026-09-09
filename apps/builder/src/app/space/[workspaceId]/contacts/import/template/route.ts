import { getIdFromParams } from "@chatbotx.io/utils"
import {
  buildContactsImportTemplateCsv,
  CONTACTS_IMPORT_TEMPLATE_FILENAME,
} from "@/features/contacts/lib/contacts-import-template"
import { canAccessContactsSection } from "@/features/contacts/permissions"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

export const runtime = "nodejs"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return new Response(null, { status: 404 })
  }

  // A route handler must return an explicit Response on the deny path.
  // `notFound()` renders an HTML error page here (the browser saved it as
  // "template.html") instead of a real 404 for this download.
  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (
    !(
      userAndWorkspace &&
      canAccessContactsSection(
        userAndWorkspace.targetWorkspaceMember.permissions,
      )
    )
  ) {
    return new Response(null, { status: 404 })
  }

  const csv = buildContactsImportTemplateCsv(
    userAndWorkspace.targetWorkspace.language,
  )

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${CONTACTS_IMPORT_TEMPLATE_FILENAME}"`,
      "Cache-Control": "no-store",
    },
  })
}
