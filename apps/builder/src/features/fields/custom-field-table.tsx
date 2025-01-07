"use client";

import React from 'react';

import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { useDataTable } from "@/hooks/use-data-table";
import { Field, FieldType } from "@ahachat.ai/database";
import type {
  DataTableFilterField,
  DataTableRowAction,
} from "@/components/data-table/types";
import { getFields } from './queries';
import { getColumns } from './custom-field-table-columns';
import { CustomFieldsTableToolbarActions } from './custom-field-table-toolbar-actions';
import { UpdateCustomFieldDialog } from './update-custom-field-dialog';
import { useCopyToClipboard } from "usehooks-ts";
import { toast } from 'sonner';
import { DeleteFieldsDialog } from './delete-fields-dialog';

interface FieldsTableProps {
  promises: Promise<[
    Awaited<ReturnType<typeof getFields>>
  ]>;
  chatbotId: string
}

export function CustomFieldsTable({ promises, chatbotId }: FieldsTableProps) {
  const [{ data, pageCount }] = React.use(promises);
  const [rowAction, setRowAction] = React.useState<DataTableRowAction<Field> | null>(null);
  const [copiedText, copyFieldId] = useCopyToClipboard()

  const handleCopy = (id: string) => {
    copyFieldId(id)
      .then(() => {
        toast.success("Copied to clipboard!");
      })
      .catch(() => {
        toast.error("Failed to copy!");
      });
  };

  const columns = React.useMemo(
    () => getColumns({ setRowAction, handleCopy }),
    [setRowAction, handleCopy]
  )

  const filterFields: DataTableFilterField<Field & { name?: string }>[] = [
    {
      id: "name",
      label: "Search",
      placeholder: "Enter Field name...",
    },
  ];

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    filterFields,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      columnPinning: { right: ["actions"] },
    },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  });

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table} filterFields={filterFields}>
          <CustomFieldsTableToolbarActions table={table} chatbotId={chatbotId} setRowAction={setRowAction} />
        </DataTableToolbar>
      </DataTable>

      <DeleteFieldsDialog
        open={rowAction?.type === "delete"}
        onOpenChange={() => setRowAction(null)}
        fields={rowAction?.row.original ? [rowAction?.row.original] : []}
        showTrigger={false}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        chatbotId={chatbotId}
        fieldType={FieldType.CustomField}
      />

      <UpdateCustomFieldDialog
        open={rowAction?.type === "update"}
        onOpenChange={() => setRowAction(null)}
        chatbotId={chatbotId}
        customField={rowAction?.row.original || null}
      />
    </>
  );
}

