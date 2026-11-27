import type { SearchParams } from "nuqs/server"
import { TemplateStorePage } from "@/features/template-store/components/template-store-pages"

export default function AdminTemplateStorePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  return <TemplateStorePage scopeKind="platform" searchParams={searchParams} />
}
