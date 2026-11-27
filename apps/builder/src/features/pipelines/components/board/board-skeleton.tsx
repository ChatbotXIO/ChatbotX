import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"

const PLACEHOLDER_COLUMNS = [0, 1, 2]

export function BoardSkeleton() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4"
      data-testid="board-loading"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-5 w-8 rounded-full" />
        </div>
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="flex min-h-0 flex-1 items-stretch gap-6 overflow-hidden pb-3">
        {PLACEHOLDER_COLUMNS.map((key) => (
          <div
            className="flex w-[300px] shrink-0 flex-col rounded-xl border bg-muted/40"
            key={key}
          >
            <div className="flex min-h-12 items-center border-b px-3 py-2">
              <Skeleton className="h-5 w-32" />
            </div>
            <div className="flex flex-col gap-3 p-3">
              <Skeleton className="h-28 w-full rounded-lg" />
              <Skeleton className="h-28 w-full rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
