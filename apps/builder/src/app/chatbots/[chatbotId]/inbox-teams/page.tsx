import { DataTableSkeleton } from '@/components/data-table/data-table-skeleton';
import { CreateTeamMemberDialog } from '@/features/inbox-teams/create-team-member-dialog';
import { ListInboxTeamMembersTable } from '@/features/inbox-teams/inbox-team-members-table';
import { getAllUsers, getInboxTeamMembers } from '@/features/inbox-teams/queries';
import { getInboxTeamMembersSearchParamsCache } from '@/features/inbox-teams/schemas/get-inbox-teams-schema';
import { Suspense } from 'react';

export default async function InboxTeamsPage(
  props: { params: Promise<{ chatbotId: string }>, searchParams: Promise<any> }
) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = getInboxTeamMembersSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    getInboxTeamMembers({
      ...search,
      chatbotId: params.chatbotId,
      teamId: search.teamId
    })
  ])

  const allUsersPromise = getAllUsers({
    chatbotId: params.chatbotId,
  });

  const allUsers = await allUsersPromise;

  return (
    <div className=''>
      <div className="flex w-full justify-end mb-4">
        <h3 className="font-bold flex-1">
          List Member
        </h3>
        <CreateTeamMemberDialog chatbotId={params.chatbotId} teamId={search.teamId} listUsers={allUsers} />
      </div>
      {
        search.teamId === "" ? "Please Choose Team" : (
          <Suspense fallback={
            <DataTableSkeleton
              columnCount={6}
              searchableColumnCount={1}
              filterableColumnCount={1}
              cellWidths={["10rem", "40rem", "12rem", "12rem", "12rem", "12rem"]}
              shrinkZero
            />
          }>
            <ListInboxTeamMembersTable promises={promises} chatbotId={params.chatbotId} teamId={search.teamId} />
          </Suspense>
        )
      }
    </div>
  )
}
