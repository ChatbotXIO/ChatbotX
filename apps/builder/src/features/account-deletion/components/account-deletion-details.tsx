import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@chatbotx.io/ui/components/ui/alert"
import { TriangleAlertIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { OwnedWorkspaceList } from "./owned-workspace-list"

type AccountDeletionDetailsProps = {
  ownedWorkspaces: { id: string; name: string }[]
}

export const AccountDeletionDetails = ({
  ownedWorkspaces,
}: AccountDeletionDetailsProps) => {
  const t = useTranslations("accountDeletion")

  return (
    <>
      <OwnedWorkspaceList ownedWorkspaces={ownedWorkspaces} />
      <Alert variant="destructive">
        <TriangleAlertIcon aria-hidden="true" />
        <AlertTitle>{t("title")}</AlertTitle>
        <AlertDescription>
          <ul className="list-disc space-y-1 ps-4">
            <li>{t("warningGracePeriod")}</li>
            <li>{t("warningIrreversible")}</li>
            <li>{t("warningSubscriptions")}</li>
          </ul>
        </AlertDescription>
      </Alert>
    </>
  )
}
