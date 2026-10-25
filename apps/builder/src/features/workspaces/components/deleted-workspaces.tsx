import { workspaceDeletionRecordService } from "@chatbotx.io/business"
import { getTranslations } from "next-intl/server"
import { DeletionRecordEvidence } from "./deletion-record-evidence"

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
      <h2 className="font-semibold text-base">
        {t("platformAdmin.workspaces.deletedTitle")}
      </h2>
      <ul className="space-y-2">
        {records.data.map((record) => (
          <li className="rounded-md border p-3 text-sm" key={record.id}>
            <div className="font-medium">{record.workspaceName}</div>
            <DeletionRecordEvidence record={record} />
          </li>
        ))}
      </ul>
    </section>
  )
}
