import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Building2Icon } from "lucide-react"
import { useTranslations } from "next-intl"

type OwnedWorkspace = {
  id: string
  name: string
}

export const OwnedWorkspaceList = ({
  ownedWorkspaces,
}: {
  ownedWorkspaces: OwnedWorkspace[]
}) => {
  const t = useTranslations("accountDeletion")

  return (
    <section aria-labelledby="owned-workspaces-title" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium text-sm" id="owned-workspaces-title">
          {t("workspacesTitle")}
        </h2>
        <Badge variant="secondary">{ownedWorkspaces.length}</Badge>
      </div>
      {ownedWorkspaces.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("noWorkspaces")}</p>
      ) : (
        <ul className="max-h-48 space-y-2 overflow-y-auto">
          {ownedWorkspaces.map((workspace) => (
            <li
              className="flex items-center gap-3 rounded-md border p-3"
              key={workspace.id}
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                <Building2Icon
                  aria-hidden="true"
                  className="size-4 text-muted-foreground"
                />
              </div>
              <span className="truncate text-sm">{workspace.name}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
