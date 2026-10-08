import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"

const TILE_KEYS = ["a", "b", "c", "d", "e", "f"]

/** First-entry placeholder shaped like the loaded page (tiles, chart, table). */
export function StatsSkeleton() {
  return (
    <div aria-busy="true" className="flex min-w-0 flex-col gap-5">
      <Skeleton className="h-12 w-full max-w-md" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {TILE_KEYS.map((key) => (
          <Skeleton className="h-24 w-full" key={key} />
        ))}
      </div>
      <Skeleton className="h-80 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  )
}
