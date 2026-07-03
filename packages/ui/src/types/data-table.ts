import type { DataTableConfig } from "@chatbotx.io/ui/config/data-table"
import type { FilterItemSchema } from "@chatbotx.io/ui/lib/parsers"
import type { ColumnSort, Row, RowData } from "@tanstack/react-table"

declare module "@tanstack/react-table" {
  // biome-ignore lint/correctness/noUnusedVariables: TValue is used in the ColumnMeta interface
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string
    placeholder?: string
    variant?: FilterVariant
    options?: Option[]
    range?: [number, number]
    unit?: string
    icon?: React.FC<React.SVGProps<SVGSVGElement>>
    /**
     * Overrides the URL query-param key used to persist this column's filter
     * value. Defaults to the column id. Set this when the column id needs to
     * stay aligned with a server field for sorting (e.g. a DB column name)
     * while the filter should be persisted under a different query param
     * (e.g. a broader search field the server expects).
     */
    filterKey?: string
  }
}

export interface Option {
  label: string
  value: string
  count?: number
  icon?: React.FC<React.SVGProps<SVGSVGElement>>
}

export type FilterOperator = DataTableConfig["operators"][number]
export type FilterVariant = DataTableConfig["filterVariants"][number]
export type JoinOperator = DataTableConfig["joinOperators"][number]

export interface ExtendedColumnSort<TData> extends Omit<ColumnSort, "id"> {
  id: Extract<keyof TData, string>
}

export interface ExtendedColumnFilter<TData> extends FilterItemSchema {
  id: Extract<keyof TData, string>
}

export interface DataTableRowAction<TData> {
  row: Row<TData>
  variant: "update" | "delete" | "duplicate" | "rename" | "resend" | "enable" | "move" | "copyUrl"
}

export type { ColumnDef } from "@tanstack/react-table"
