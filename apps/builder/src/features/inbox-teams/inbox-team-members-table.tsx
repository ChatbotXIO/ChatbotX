"use client";

import React from 'react';
import { TeamMember } from "@ahachat.ai/database";
import type {
  DataTableRowAction,
} from "@/components/data-table/types";
import { getInboxTeamMembers } from './queries';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { useDataTable } from '@/hooks/use-data-table';
import { getTeamMembersTableColumns } from './inbox-team-members-table-column';
import { DeleteTeamMembersDialog } from './delete-team-member-dialog';

interface ListInboxTeamMembersProps {
  promises: Promise<[
    Awaited<ReturnType<typeof getInboxTeamMembers>>
  ]>;
  chatbotId: string
  teamId: string
}

export function ListInboxTeamMembersTable({ promises, chatbotId, teamId }: ListInboxTeamMembersProps) {
  const [{ data, pageCount }] = React.use(promises);
  const [rowAction, setRowAction] = React.useState<DataTableRowAction<TeamMember> | null>(null);

  const columns = React.useMemo(
    () => getTeamMembersTableColumns({ setRowAction }),
    [setRowAction]
  )

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
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
        <DataTableToolbar table={table}>
        </DataTableToolbar>
      </DataTable>

      <DeleteTeamMembersDialog
        open={rowAction?.type === "delete"}
        onOpenChange={() => setRowAction(null)}
        members={rowAction?.row.original ? [rowAction?.row.original] : []}
        showTrigger={false}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        chatbotId={chatbotId}
        teamId={teamId}
      />
    </>
  );
}

