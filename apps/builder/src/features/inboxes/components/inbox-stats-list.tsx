"use client"

import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import { subDays } from "date-fns"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useAnalysisStore } from "@/features/analysis/provider/analysis-store-context"

export default function InboxStatsList() {
  const t = useTranslations()
  const chatbotId = useAnalysisStore((s) => s.chatbotId)
  const from = useAnalysisStore((s) => s.from)
  const to = useAnalysisStore((s) => s.to)
  const [totalContacts, setTotalContacts] = useState<number | null>(null)
  const [newContacts, setNewContacts] = useState<number | null>(null)
  const [activeContacts, setActiveContacts] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingNew, setLoadingNew] = useState(true)
  const [loadingActive, setLoadingActive] = useState(true)

  useEffect(() => {
    if (!chatbotId) {
      return
    }

    const fetchTotalContacts = async () => {
      try {
        const response = await fetch(
          `/api/chatbots/${chatbotId}/contacts/count`,
        )

        if (!response.ok) {
          throw new Error("Failed to fetch total contacts")
        }

        const result = (await response.json()) as { total: number }
        setTotalContacts(result.total)
      } catch (error) {
        console.error("Failed to fetch total contacts:", error)
        setTotalContacts(0)
      } finally {
        setLoading(false)
      }
    }

    fetchTotalContacts()
  }, [chatbotId])

  useEffect(() => {
    if (!chatbotId) {
      return
    }

    const fetchNewContacts = async () => {
      try {
        const toDate = to ? new Date(to) : new Date()
        const fromDate = from ? new Date(from) : subDays(toDate, 7)

        const params = new URLSearchParams({
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
        })

        const response = await fetch(
          `/api/chatbots/${chatbotId}/analytics/new-contacts-count?${params}`,
        )

        if (!response.ok) {
          throw new Error("Failed to fetch new contacts count")
        }

        const result = (await response.json()) as { count: number }
        setNewContacts(result.count)
      } catch (error) {
        console.error("Failed to fetch new contacts count:", error)
        setNewContacts(0)
      } finally {
        setLoadingNew(false)
      }
    }

    fetchNewContacts()
  }, [chatbotId, from, to])

  useEffect(() => {
    if (!chatbotId) {
      return
    }

    const fetchActiveContacts = async () => {
      try {
        const toDate = to ? new Date(to) : new Date()
        const fromDate = from ? new Date(from) : subDays(toDate, 7)

        const params = new URLSearchParams({
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
        })

        const response = await fetch(
          `/api/chatbots/${chatbotId}/analytics/active-contacts-count?${params}`,
        )

        if (!response.ok) {
          throw new Error("Failed to fetch active contacts count")
        }

        const result = (await response.json()) as { count: number }
        setActiveContacts(result.count)
      } catch (error) {
        console.error("Failed to fetch active contacts count:", error)
        setActiveContacts(0)
      } finally {
        setLoadingActive(false)
      }
    }

    fetchActiveContacts()
  }, [chatbotId, from, to])

  return (
    <div className="flex flex-wrap gap-4">
      <Card className="flex-1 py-4">
        <CardContent className="flex flex-col items-center justify-center gap-2 px-4">
          <h3 className="text-sm">{t("analytics.contacts")}</h3>
          <p className="font-bold text-sm">
            {loading ? "..." : (totalContacts?.toLocaleString() ?? 0)}
          </p>
        </CardContent>
      </Card>

      <Card className="flex-1 py-4">
        <CardContent className="flex flex-col items-center justify-center gap-2 px-4">
          <h3 className="text-sm">{t("analytics.newContacts")}</h3>
          <p className="font-bold text-sm">
            {loadingNew ? "..." : (newContacts?.toLocaleString() ?? 0)}
          </p>
        </CardContent>
      </Card>

      <Card className="flex-1 py-4">
        <CardContent className="flex flex-col items-center justify-center gap-2 px-4">
          <h3 className="text-sm">{t("analytics.activeContacts")}</h3>
          <p className="font-bold text-sm">
            {loadingActive ? "..." : (activeContacts?.toLocaleString() ?? 0)}
          </p>
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
