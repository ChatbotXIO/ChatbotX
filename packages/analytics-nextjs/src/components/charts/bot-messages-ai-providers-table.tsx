"use client"

import { useTranslations } from "next-intl"
import { useAnalysisStore } from "../../provider/analysis-store-context"

export function BotMessagesAIProvidersTable() {
  const t = useTranslations()

  const { botMessagesAIProviders } = useAnalysisStore((state) => state)

  return (
    <div className="rounded-md border">
      <table className="w-full">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-sm">
              {t("analytics.aiProvider")}
            </th>
            <th className="px-4 py-3 text-right font-medium text-sm">
              {t("analytics.responseCount")}
            </th>
            <th className="px-4 py-3 text-right font-medium text-sm">
              {t("analytics.percentage")}
            </th>
          </tr>
        </thead>
        <tbody>
          {botMessagesAIProviders.length === 0 ? (
            <tr>
              <td
                className="px-4 py-8 text-center text-muted-foreground text-sm"
                colSpan={3}
              >
                No data
              </td>
            </tr>
          ) : (
            botMessagesAIProviders.map((row) => (
              <tr className="border-b last:border-0" key={row.aiProvider}>
                <td className="px-4 py-3 font-medium text-sm capitalize">
                  {row.aiProvider}
                </td>
                <td className="px-4 py-3 text-right text-sm">
                  {row.count.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-sm">
                  {row.percentage.toFixed(1)}%
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
