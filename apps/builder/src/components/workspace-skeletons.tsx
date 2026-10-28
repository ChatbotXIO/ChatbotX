import { DataTableSkeleton } from "@chatbotx.io/ui/components/data-table/data-table-skeleton"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import type { ReactNode } from "react"
import { FullBleed } from "@/components/full-bleed"

const TAB_PLACEHOLDERS = ["a", "b", "c", "d"]
const STAT_PLACEHOLDERS = ["a", "b", "c", "d"]
const INBOX_CARD_PLACEHOLDERS = ["a", "b", "c"]
const CONVERSATION_PLACEHOLDERS = ["a", "b", "c", "d", "e", "f", "g", "h"]
const MESSAGE_PLACEHOLDERS = [
  { key: "a", className: "h-10 w-2/5" },
  { key: "b", className: "ms-auto h-14 w-1/2" },
  { key: "c", className: "h-10 w-1/3" },
  { key: "d", className: "ms-auto h-10 w-2/5" },
]
const DETAIL_PLACEHOLDERS = ["a", "b", "c", "d", "e"]
const FIELD_PLACEHOLDERS = ["a", "b", "c", "d"]

/** The frame every workspace skeleton shares, so screen readers hear one busy region. */
function SkeletonFrame({
  children,
  className = "space-y-4",
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div aria-busy className={className} role="status">
      {children}
    </div>
  )
}

function PageHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between gap-2">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-9 w-28" />
    </div>
  )
}

/** A plain list page: title, primary button and a table. */
export function PageSkeleton() {
  return (
    <SkeletonFrame>
      <PageHeaderSkeleton />
      <DataTableSkeleton columnCount={5} filterCount={1} rowCount={8} />
    </SkeletonFrame>
  )
}

/** A page under a tab strip (flows, tags, keywords, settings…). */
export function TabbedTablePageSkeleton() {
  return (
    <SkeletonFrame>
      <div className="flex h-12 items-center gap-8 rounded-xl border bg-card px-4 md:px-8">
        {TAB_PLACEHOLDERS.map((key) => (
          <Skeleton className="h-4 w-20" key={key} />
        ))}
      </div>
      <PageHeaderSkeleton />
      <DataTableSkeleton columnCount={5} filterCount={1} rowCount={8} />
    </SkeletonFrame>
  )
}

/**
 * The content under a tab strip, shown by `AppTab` while a tab loads. Every
 * sibling after it — the current tab's page — is hidden (kept mounted), so the
 * real strip stays in place and only the area below it changes.
 */
export function TabContentSkeleton() {
  return (
    <SkeletonFrame className="space-y-4 [&~*]:hidden">
      <PageHeaderSkeleton />
      <DataTableSkeleton columnCount={5} filterCount={1} rowCount={8} />
    </SkeletonFrame>
  )
}

/** A create/edit page: back link and title, then a card of form fields. */
export function FormPageSkeleton() {
  return (
    <SkeletonFrame>
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-md" />
        <Skeleton className="h-7 w-48" />
      </div>
      <div className="space-y-6 rounded-xl border bg-card p-6">
        {FIELD_PLACEHOLDERS.map((key) => (
          <div className="space-y-2" key={key}>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="flex justify-end gap-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
      </div>
    </SkeletonFrame>
  )
}

/** The flow builder: a toolbar over a full-height canvas. */
export function FlowEditorSkeleton() {
  return (
    <FullBleed>
      <SkeletonFrame className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-14 items-center justify-between gap-3 border-b px-4">
          <Skeleton className="h-6 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center gap-16 p-8">
          <Skeleton className="h-32 w-56 rounded-xl" />
          <Skeleton className="h-40 w-56 rounded-xl" />
        </div>
      </SkeletonFrame>
    </FullBleed>
  )
}

/** The analytics content below the inbox cards: filter bar, stat tiles and charts. */
export function DashboardContentSkeleton() {
  return (
    <SkeletonFrame>
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-56" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STAT_PLACEHOLDERS.map((key) => (
          <div className="space-y-3 rounded-xl border bg-card p-4" key={key}>
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </SkeletonFrame>
  )
}

/** The whole analytics page: the shared inbox cards plus its content. */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4 overflow-hidden">
        {INBOX_CARD_PLACEHOLDERS.map((key) => (
          <Skeleton className="h-20 w-56 shrink-0 rounded-xl" key={key} />
        ))}
      </div>
      <DashboardContentSkeleton />
    </div>
  )
}

// Sections whose layout renders a tab strip above the page.
const TABBED_SECTIONS = new Set([
  "automated-responses",
  "custom-fields",
  "email-topics",
  "error-logs",
  "flows",
  "page-automated-responses",
  "settings",
  "tags",
])

const FORM_SEGMENTS = new Set(["create", "edit", "new"])
const NUMERIC_SEGMENT = /^\d+$/

// A create/edit route, or a record page addressed by its id (`/sequences/12`).
function isFormRoute(segments: string[]) {
  const last = segments.at(-1) ?? ""
  return (
    segments.some((segment) => FORM_SEGMENTS.has(segment)) ||
    NUMERIC_SEGMENT.test(last)
  )
}

type WorkspaceSkeletonKind =
  | "dashboard"
  | "flowEditor"
  | "form"
  | "inbox"
  | "page"
  | "tabbed"

/** Which skeleton matches the workspace page at `pathname`. */
export function resolveWorkspaceSkeletonKind(
  pathname: string,
): WorkspaceSkeletonKind {
  // `/space/<workspaceId>/<section>/...`
  const segments = pathname.split("/").slice(3)
  const [section] = segments

  if (section === "inbox") {
    return "inbox"
  }
  if (section === "dashboard") {
    return "dashboard"
  }
  // The flow builder canvas (`/flows/<id>`), outside the workspace shell.
  if (
    section === "flows" &&
    segments.length === 2 &&
    NUMERIC_SEGMENT.test(segments[1] ?? "")
  ) {
    return "flowEditor"
  }
  if (isFormRoute(segments)) {
    return "form"
  }
  // Every settings page sits under the settings tab strip; the other tabbed
  // sections only show it on their list page.
  if (
    section === "settings" ||
    (section && segments.length === 1 && TABBED_SECTIONS.has(section))
  ) {
    return "tabbed"
  }
  return "page"
}

const SKELETON_BY_KIND: Record<WorkspaceSkeletonKind, () => ReactNode> = {
  dashboard: DashboardSkeleton,
  flowEditor: FlowEditorSkeleton,
  form: FormPageSkeleton,
  inbox: InboxSkeleton,
  page: PageSkeleton,
  tabbed: TabbedTablePageSkeleton,
}

/** Renders the skeleton shaped like the workspace page at `pathname`. */
export function WorkspaceRouteSkeleton({ pathname }: { pathname: string }) {
  const RouteSkeleton = SKELETON_BY_KIND[resolveWorkspaceSkeletonKind(pathname)]
  return <RouteSkeleton />
}

/** The inbox's three panes: conversation list, chat thread and contact details. */
export function InboxSkeleton() {
  return (
    <FullBleed>
      <SkeletonFrame className="flex min-h-0 flex-1">
        <div className="hidden w-1/4 min-w-64 flex-col gap-3 border-e p-3 md:flex">
          <Skeleton className="h-9 w-full" />
          {CONVERSATION_PLACEHOLDERS.map((key) => (
            <div className="flex items-center gap-3" key={key}>
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <Skeleton className="h-5 w-40" />
          </div>
          <div className="flex flex-1 flex-col justify-end gap-3">
            {MESSAGE_PLACEHOLDERS.map(({ key, className }) => (
              <Skeleton className={`${className} rounded-2xl`} key={key} />
            ))}
          </div>
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
        <div className="hidden w-1/4 min-w-64 flex-col gap-3 border-s p-4 lg:flex">
          <Skeleton className="mx-auto size-16 rounded-full" />
          <Skeleton className="mx-auto h-5 w-1/2" />
          {DETAIL_PLACEHOLDERS.map((key) => (
            <Skeleton className="h-4 w-full" key={key} />
          ))}
        </div>
      </SkeletonFrame>
    </FullBleed>
  )
}
