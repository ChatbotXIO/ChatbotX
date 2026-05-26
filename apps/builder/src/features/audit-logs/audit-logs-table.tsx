"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { use, useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import type { ListWorkspaceMembersResponse } from "@/features/workspace-members/schema/query"
import type { listAuditLogActions, listAuditLogs } from "./queries"
import type { AuditLogResource } from "./schemas"

type AuditLogsTableProps = {
  workspaceId: string
  promises: Promise<
    [
      Awaited<ReturnType<typeof listAuditLogs>>,
      Awaited<ReturnType<typeof listAuditLogActions>>,
      Awaited<
        ReturnType<
          typeof import("@/features/workspace-members/queries").listWorkspaceMembers
        >
      >,
    ]
  >
}

const actionToBadge: Record<string, { label: string; className: string }> = {
  "team.created": {
    label: "Equipe criada",
    className: "bg-emerald-500/15 text-emerald-300",
  },
  "team.updated": {
    label: "Equipe atualizada",
    className: "bg-blue-500/15 text-blue-300",
  },
  "team.deleted": {
    label: "Equipe excluída",
    className: "bg-rose-500/15 text-rose-300",
  },
  "team.member.added": {
    label: "Membro adicionado",
    className: "bg-emerald-500/15 text-emerald-300",
  },
  "team.member.removed": {
    label: "Membro removido",
    className: "bg-amber-500/15 text-amber-300",
  },
  "user.invited": {
    label: "Usuário convidado",
    className: "bg-violet-500/15 text-violet-300",
  },
  "user.role.updated": {
    label: "Nível alterado",
    className: "bg-blue-500/15 text-blue-300",
  },
  "user.permissions.updated": {
    label: "Permissões alteradas",
    className: "bg-blue-500/15 text-blue-300",
  },
  "user.revoked": {
    label: "Acesso revogado",
    className: "bg-rose-500/15 text-rose-300",
  },
  "contact.created": {
    label: "Contato criado",
    className: "bg-emerald-500/15 text-emerald-300",
  },
  "contact.deleted": {
    label: "Contato excluído",
    className: "bg-rose-500/15 text-rose-300",
  },
  "contact.lifecycle.changed": {
    label: "Ciclo de vida",
    className: "bg-blue-500/15 text-blue-300",
  },
  "contact.blocked": {
    label: "Contato bloqueado",
    className: "bg-rose-500/15 text-rose-300",
  },
  "contact.unblocked": {
    label: "Contato desbloqueado",
    className: "bg-emerald-500/15 text-emerald-300",
  },
}

function ActionBadge({ action }: { action: string }) {
  const meta = actionToBadge[action]
  if (meta) {
    return (
      <Badge className={`${meta.className} border-0`} variant="secondary">
        {meta.label}
      </Badge>
    )
  }
  return <Badge variant="secondary">{action}</Badge>
}

function LogRow({ log }: { log: AuditLogResource }) {
  return (
    <tr className="border-white/[0.06] border-b last:border-b-0">
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <Avatar className="size-7">
            <AvatarImage
              alt={log.user?.name ?? ""}
              src={log.user?.image ?? undefined}
            />
            <AvatarFallback>
              {(log.user?.name || log.user?.email || "?")
                .charAt(0)
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="text-sm">
            <div className="font-medium text-foreground">
              {log.user?.name ?? log.user?.email ?? "Sistema"}
            </div>
            {log.user?.email && (
              <div className="text-text-secondary text-xs">
                {log.user.email}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <ActionBadge action={log.action} />
      </td>
      <td className="px-3 py-3 text-foreground text-sm">{log.detail}</td>
      <td className="whitespace-nowrap px-3 py-3 text-text-secondary text-xs">
        {format(new Date(log.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
      </td>
    </tr>
  )
}

export function AuditLogsTable({ workspaceId, promises }: AuditLogsTableProps) {
  const t = useTranslations("auditLogs")
  const router = useRouter()
  const searchParams = useSearchParams()
  const [{ data, pageCount, totalRows }, actions, workspaceMembers] =
    use(promises)
  const [, startTransition] = useTransition()
  const [isExporting, setIsExporting] = useState(false)

  const page = Number(searchParams.get("page") ?? "1")
  const userIdFilter = searchParams.get("userId") ?? ""
  const actionFilter = searchParams.get("action") ?? ""
  const keyword = searchParams.get("keyword") ?? ""
  const [keywordDraft, setKeywordDraft] = useState(keyword)

  const members = (workspaceMembers as ListWorkspaceMembersResponse).data ?? []

  const filtered = useMemo(() => {
    if (!keyword.trim()) {
      return data
    }
    const q = keyword.toLowerCase()
    return data.filter(
      (l) =>
        l.detail.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        (l.user?.name ?? "").toLowerCase().includes(q) ||
        (l.user?.email ?? "").toLowerCase().includes(q),
    )
  }, [data, keyword])

  const updateParams = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") {
        params.delete(k)
      } else {
        params.set(k, v)
      }
    }
    startTransition(() => {
      router.push(`?${params.toString()}`)
    })
  }

  const handleKeywordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateParams({ keyword: keywordDraft || null, page: "1" })
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const res = await fetch(
        `/api/audit-logs/export?${searchParams.toString()}&workspaceId=${workspaceId}`,
      )
      if (!res.ok) {
        throw new Error("Falha ao exportar")
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `logs-de-atividade-${format(new Date(), "yyyy-MM-dd")}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success(t("exportSuccess"))
    } catch {
      toast.error(t("exportError"))
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-semibold text-foreground text-xl">
          <ShieldCheckIcon className="h-5 w-5" />
          {t("title")}
        </h2>
        <p className="mt-1 text-sm text-text-secondary">{t("subtitle")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form
          className="relative max-w-xs flex-1"
          onSubmit={handleKeywordSubmit}
        >
          <SearchIcon className="absolute top-2.5 left-3 h-4 w-4 text-text-secondary" />
          <Input
            className="pl-9"
            onChange={(e) => setKeywordDraft(e.target.value)}
            placeholder={t("searchPlaceholder")}
            value={keywordDraft}
          />
        </form>

        <Select
          onValueChange={(v) =>
            updateParams({ userId: v === "__all__" ? null : v, page: "1" })
          }
          value={userIdFilter || "__all__"}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t("filterUser")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("filterUserAll")}</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.userId} value={m.userId}>
                {m.user.name || m.user.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          onValueChange={(v) =>
            updateParams({ action: v === "__all__" ? null : v, page: "1" })
          }
          value={actionFilter || "__all__"}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder={t("filterAction")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("filterActionAll")}</SelectItem>
            {actions.map((a) => (
              <SelectItem key={a} value={a}>
                {actionToBadge[a]?.label ?? a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto">
          <Button
            disabled={isExporting || totalRows === 0}
            onClick={handleExport}
            size="sm"
            type="button"
            variant="outline"
          >
            <DownloadIcon className="h-4 w-4" />
            {t("exportCsv")}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-white/[0.06] bg-app-surface">
        <table className="w-full">
          <thead className="border-white/[0.06] border-b bg-white/[0.02]">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-text-secondary text-xs">
                {t("columns.user")}
              </th>
              <th className="px-3 py-2 text-left font-medium text-text-secondary text-xs">
                {t("columns.action")}
              </th>
              <th className="px-3 py-2 text-left font-medium text-text-secondary text-xs">
                {t("columns.detail")}
              </th>
              <th className="px-3 py-2 text-left font-medium text-text-secondary text-xs">
                {t("columns.when")}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-8 text-center text-sm text-text-secondary"
                  colSpan={4}
                >
                  {t("empty")}
                </td>
              </tr>
            ) : (
              filtered.map((log) => <LogRow key={log.id} log={log} />)
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-text-secondary">
        <span>{t("totalRows", { count: totalRows })}</span>
        <div className="flex items-center gap-2">
          <Button
            disabled={page <= 1}
            onClick={() => updateParams({ page: String(page - 1) })}
            size="sm"
            type="button"
            variant="ghost"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <span>
            {page} / {Math.max(1, pageCount)}
          </span>
          <Button
            disabled={page >= pageCount}
            onClick={() => updateParams({ page: String(page + 1) })}
            size="sm"
            type="button"
            variant="ghost"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
