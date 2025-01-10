"use client";

import React, { useState } from 'react';
import { Team } from "@ahachat.ai/database"
import { ScrollArea } from '@/components/ui/scroll-area';
import { getInboxTeams } from './queries';
import { Button } from '@/components/ui/button';
import { FolderIcon, PencilIcon, TrashIcon } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { DeleteTeamDialog } from './delete-team-dialog';
import { UpdateTeamDialog } from './update-team-dialog';

interface ListInboxTeamsProps {
  promises: Promise<[
    Awaited<ReturnType<typeof getInboxTeams>>
  ]>;
  chatbotId: string
}

interface TeamWithCount extends Team {
  _count: {
    teamMembers: number;
  };
}

export function ListInboxTeams({ promises, chatbotId }: ListInboxTeamsProps) {
  const [{ data }] = React.use(promises);
  const [, setTeamId] = useQueryState("teamId", parseAsString.withOptions({
    history: "replace",
    shallow: false,
  }))

  const [targetTeam, setTargetTeam] = useState<TeamWithCount | null>(null)

  const [openEditDialog, setOpenEditDialog] = useState<boolean>(false)
  const onEdit = (team: TeamWithCount) => {
    setTargetTeam(team)
    setOpenEditDialog(true)
  }

  const [openDeleteDialog, setOpenDeleteDialog] = useState<boolean>(false)
  const onDelete = (team: TeamWithCount) => {
    setTargetTeam(team)
    setOpenDeleteDialog(true)
  }

  console.log("Xem data của team list", data)

  return (
    <>
      <ScrollArea className="max-h-44" type="auto">
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3 lg:grid-cols-5">
          {
            data.map((team: any) => {
              return (
                <div className="overflow-hidden" key={team.id}>
                  <div className="group flex items-center border rounded-lg gap-2 hover:border-primary pr-3">
                    <Button
                      variant="ghost"
                      size="lg"
                      className="flex overflow-hidden whitespace-nowrap text-ellipsis hover:bg-transparent"
                      onClick={() => setTeamId(team.id)}
                    >
                      <FolderIcon />
                      <div className="flex">
                        <p>
                          {team.name}
                        </p>
                        <p className='text-gray-400 ml-10'>
                          {team._count.teamMembers}
                        </p>
                      </div>
                    </Button>
                    <>
                      <Button size="sm" variant="ghost" className="px-1 lg:hidden lg:group-hover:inline-flex" onClick={() => onEdit(team)}>
                        <PencilIcon />
                      </Button>
                      <Button size="sm" variant="ghost" className="px-1 lg:hidden lg:group-hover:inline-flex" onClick={() => onDelete(team)}>
                        <TrashIcon />
                      </Button>
                    </>
                  </div>
                </div>
              )
            })
          }
        </div>
      </ScrollArea>

      <DeleteTeamDialog
        open={openDeleteDialog}
        onOpenChange={setOpenDeleteDialog}
        chatbotId={chatbotId}
        team={targetTeam}
      />

      <UpdateTeamDialog
        open={openEditDialog}
        onOpenChange={setOpenEditDialog}
        chatbotId={chatbotId}
        team={targetTeam}
      />
    </>
  );
}

