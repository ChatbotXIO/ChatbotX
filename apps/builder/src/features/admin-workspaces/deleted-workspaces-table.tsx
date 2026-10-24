import { format } from "date-fns"
import { getTranslations } from "next-intl/server"
import type { WorkspaceDeletionRecordResource } from "@/features/workspaces/schema/deletion-record"

type DeletedWorkspacesTableProps = {
  records: WorkspaceDeletionRecordResource[]
}

export const DeletedWorkspacesTable = async ({
  records,
}: DeletedWorkspacesTableProps) => {
  const t = await getTranslations()

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-start font-medium">
              {t("fields.name.label")}
            </th>
            <th className="px-3 py-2 text-start font-medium">
              {t("platformAdmin.workspaces.owner")}
            </th>
            <th className="px-3 py-2 text-start font-medium">
              {t("fields.createdAt.label")}
            </th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr className="border-t" key={record.id}>
              <td className="px-3 py-2">
                <details>
                  <summary className="cursor-pointer">
                    {record.workspaceName}
                  </summary>
                  <pre className="mt-2 max-w-xl overflow-x-auto whitespace-pre-wrap text-xs">
                    {JSON.stringify(
                      {
                        details: record.details,
                        usageSnapshot: record.usageSnapshot,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </td>
              <td className="px-3 py-2">{record.ownerEmail ?? "—"}</td>
              <td className="px-3 py-2">
                {record.purgedAt ? format(record.purgedAt, "PPp") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
