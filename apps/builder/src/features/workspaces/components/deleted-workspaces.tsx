import { workspaceDeletionRecordService } from "@chatbotx.io/business"
import { format } from "date-fns"
import { getTranslations } from "next-intl/server"

export const DeletedWorkspaces = async ({ ownerId }: { ownerId: string }) => {
  const [t, records] = await Promise.all([
    getTranslations(),
    workspaceDeletionRecordService.listForOwner({
      ownerId,
      page: 1,
      perPage: 20,
    }),
  ])
  if (records.data.length === 0) {
    return null
  }

  return (
    <section className="space-y-2">
      <h2 className="font-semibold text-base">{t("fields.workspace.label")}</h2>
      <ul className="space-y-2">
        {records.data.map((record) => (
          <li className="rounded-md border p-3 text-sm" key={record.id}>
            <div className="font-medium">{record.workspaceName}</div>
            <div className="text-muted-foreground">
              {record.purgedAt ? format(record.purgedAt, "PPp") : "—"}
            </div>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">
              {JSON.stringify(record.usageSnapshot, null, 2)}
            </pre>
          </li>
        ))}
      </ul>
    </section>
  )
}
