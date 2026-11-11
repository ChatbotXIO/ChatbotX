import type { SearchParams } from "nuqs/server"
import { TemplateStorePage } from "@/features/template-store/components/template-store-pages"

export default function ManageTemplateStorePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  return <TemplateStorePage scopeKind="tenant" searchParams={searchParams} />
}
