
import { CreateTeamDialog } from "@/features/inbox-teams/create-team-dialog";
import { ListInboxTeams } from "@/features/inbox-teams/list-inbox-teams";
import { getAllUsers, getInboxTeams } from "@/features/inbox-teams/queries";
import { type SearchParams } from 'nuqs/server';
import { Suspense } from "react";

export default async function TeamsPage(props: {
  params: Promise<{ chatbotId: string }>,
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams

  const promises = Promise.all([
    getInboxTeams({
      chatbotId: params.chatbotId,
    }),
  ])

  const allUsersPromise = getAllUsers({
    chatbotId: params.chatbotId,
  });

  const allUsers = await allUsersPromise;

  return (
    <>
      <div className="flex">
        <h3 className="font-bold flex-1">
          List Team
        </h3>
        <CreateTeamDialog chatbotId={params.chatbotId} allUsers={allUsers} />
      </div>

      <Suspense>
        <ListInboxTeams chatbotId={params.chatbotId} promises={promises} />
      </Suspense>
    </>
  );
}

