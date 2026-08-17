import {
  customFieldService,
  flowService,
  flowVersionService,
} from "@chatbotx.io/business"
import {
  collectCustomFieldReferences,
  FLOW_EXPORT_FORMAT_VERSION,
  type FlowExportCustomField,
  flowExportSchema,
} from "@chatbotx.io/flow-config"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"
import {
  hasWorkspacePermission,
  type WorkspacePermissionKey,
} from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

export const runtime = "nodejs"

const FLOW_EXPORT_PERMISSION: WorkspacePermissionKey = "flows"

const toExportFileName = (name: string): string => {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "flow"
  return `${slug}.chatbotx-flow.json`
}

export async function GET(
  _request: Request,
  props: { params: Promise<{ workspaceId: string; id: string }> },
) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return new Response(null, { status: 404 })
  }

  // A route handler must return an explicit Response on the deny path.
  // `notFound()` (used by requireWorkspacePermission) renders an HTML error
  // page here instead of a real 404, and the browser saves that page as the
  // downloaded file.
  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(
    data.workspaceId,
  )
  const canAccess = userAndWorkspace
    ? hasWorkspacePermission(
        userAndWorkspace.targetWorkspaceMember.permissions,
        FLOW_EXPORT_PERMISSION,
      )
    : false
  if (!canAccess) {
    return new Response(null, { status: 404 })
  }

  const flow = await flowService.findBy({
    workspaceId: data.workspaceId,
    id: data.id,
  })
  if (!flow) {
    return new Response(null, { status: 404 })
  }

  const publishedVersion = await flowVersionService.findPublished({
    flowId: flow.id,
    workspaceId: flow.workspaceId,
  })
  if (!publishedVersion) {
    return Response.json({ code: "notPublished" }, { status: 409 })
  }

  const customFieldIds = collectCustomFieldReferences({
    nodes: publishedVersion.nodes,
    edges: publishedVersion.edges,
  })
  const customFieldRows = await customFieldService.findManyByIds({
    workspaceId: flow.workspaceId,
    ids: customFieldIds,
  })
  const customFields = Object.fromEntries(
    customFieldRows.map((row): [string, FlowExportCustomField] => [
      row.id,
      { name: row.name, type: row.type },
    ]),
  )

  const envelope = {
    formatVersion: FLOW_EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    source: { workspaceId: flow.workspaceId, flowId: flow.id },
    flows: [
      {
        name: flow.name,
        active: flow.active,
        enableInInbox: flow.enableInInbox,
        startNodeId: publishedVersion.startNodeId,
        nodes: publishedVersion.nodes,
        edges: publishedVersion.edges,
      },
    ],
    customFields,
  }

  // Guards against export ever emitting a payload the importer would reject —
  // the route hand-builds the envelope above and does not otherwise validate
  // its own output.
  flowExportSchema.parse(envelope)

  const body = JSON.stringify(envelope, null, 2)

  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${toExportFileName(flow.name)}"`,
      "Cache-Control": "no-store",
    },
  })
}
