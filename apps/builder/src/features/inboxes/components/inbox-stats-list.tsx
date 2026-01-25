import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import { useTranslations } from "next-intl"

export default function InboxStatsList() {
  const t = useTranslations()

  return (
    <div className="flex flex-wrap gap-4">
      <Card className="flex-1 py-4">
        <CardContent className="flex flex-col items-center justify-center gap-2 px-4">
          <h3 className="text-sm">{t("analytics.contacts")}</h3>
          <p className="font-bold text-sm">Coming soon</p>
        </CardContent>
      </Card>

      <Card className="flex-1 py-4">
        <CardContent className="flex flex-col items-center justify-center gap-2 px-4">
          <h3 className="text-sm">{t("analytics.newContacts")}</h3>
          <p className="font-bold text-sm">Coming soon</p>
        </CardContent>
      </Card>

      <Card className="flex-1 py-4">
        <CardContent className="flex flex-col items-center justify-center gap-2 px-4">
          <h3 className="text-sm">{t("analytics.activeContacts")}</h3>
          <p className="font-bold text-sm">Coming soon</p>
        </CardContent>
      </Card>

      <Card className="flex-1 py-4">
        <CardContent className="flex flex-col items-center justify-center gap-2 px-4">
          <h3 className="text-sm">{t("analytics.responseTime")}</h3>
          <p className="font-bold text-sm">Coming soon</p>
        </CardContent>
      </Card>

      <Card className="flex-1 py-4">
        <CardContent className="flex flex-col items-center justify-center gap-2 px-4">
          <h3 className="text-sm">{t("analytics.firstResponseTime")}</h3>
          <p className="font-bold text-sm">Coming soon</p>
        </CardContent>
      </Card>
    </div>
  )
}
