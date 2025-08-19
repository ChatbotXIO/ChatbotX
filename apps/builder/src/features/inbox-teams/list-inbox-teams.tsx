"use client"

// import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@aha.chat/ui/components/ui/accordion"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@aha.chat/ui/components/ui/accordion"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { DropdownMenuItem } from "@radix-ui/react-dropdown-menu"
import { T } from "@tolgee/react"
import { MoreHorizontalIcon, Trash2Icon } from "lucide-react"
import { use, useState } from "react"
import type { getUsers } from "../users/queries"
import type { UserResource } from "../users/schemas"
import { AddInboxTeamMemberDialog } from "./add-inbox-team-member-dialog"
import { CreateInboxTeamDialog } from "./create-inbox-team-dialog"
import { DeleteInboxTeamDialog } from "./delete-inbox-team-dialog"
import { DeleteInboxTeamMembersDialog } from "./delete-inbox-team-member-dialog"
import type { getInboxTeams } from "./queries"
import { RenameInboxTeamDialog } from "./rename-inbox-team-dialog"
import type {
  InboxTeamMemberResource,
  InboxTeamResource,
} from "./schemas/types"

type ListInboxTeamsProps = {
  chatbotId: string
  promises: Promise<
    [
      Awaited<ReturnType<typeof getInboxTeams>>,
      Awaited<ReturnType<typeof getUsers>>,
    ]
  >
}

function ListInboxTeamsDetail({
  chatbotId,
  allInboxTeams,
  allUsers,
}: {
  chatbotId: string
  allInboxTeams: InboxTeamResource[]
  allUsers: UserResource[]
}) {
  const [renameInboxTeam, setRenameInboxTeam] =
    useState<InboxTeamResource | null>(null)
  const [deleteInboxTeam, setDeleteInboxTeam] =
    useState<InboxTeamResource | null>(null)
  const [addInboxTeamMember, setAddInboxTeamMember] =
    useState<InboxTeamResource | null>(null)
  const [deleteInboxTeamMember, setDeleteInboxTeamMember] =
    useState<InboxTeamMemberResource | null>(null)

  return (
    <>
      <Accordion className="w-full" collapsible type="single">
        {allInboxTeams.map((team) => {
          return (
            <AccordionItem key={team.id} value={team.id}>
              <div className="flex w-full items-center">
                <AccordionTrigger className="flex-1 gap-2 text-left">
                  <span className="flex-1 text-left">{team.name}</span>
                </AccordionTrigger>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost">
                      <MoreHorizontalIcon className="h-4 w-4" />
                      <span className="sr-only">Open menu</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="flex flex-col gap-2 p-3">
                    <DropdownMenuItem
                      className="cursor-pointer text-sm"
                      onClick={() => setRenameInboxTeam(team)}
                    >
                      <T keyName="common.renameBtn" />
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      className="cursor-pointer text-sm"
                      onClick={() => setAddInboxTeamMember(team)}
                    >
                      <T keyName="inboxTeams.addMemberBtn" />
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      className="cursor-pointer text-destructive text-sm"
                      onClick={() => setDeleteInboxTeam(team)}
                    >
                      <T keyName="common.deleteBtn" />
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <AccordionContent>
                {(team.inboxTeamMembers || []).map((member) => {
                  return (
                    <div
                      className="flex w-full items-center"
                      key={`${team.id}-${member.id}`}
                    >
                      <span className="flex-1 gap-1">{member.user?.name}</span>
                      <Button
                        className="size-6"
                        onClick={() => setDeleteInboxTeamMember(member)}
                        size="icon"
                        variant="ghost"
                      >
                        <Trash2Icon className="text-destructive" />
                      </Button>
                    </div>
                  )
                })}
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>

      <RenameInboxTeamDialog
        chatbotId={chatbotId}
        inboxTeam={renameInboxTeam}
        onOpenChange={() => setRenameInboxTeam(null)}
        open={Boolean(renameInboxTeam)}
      />
      <AddInboxTeamMemberDialog
        chatbotId={chatbotId}
        inboxTeam={addInboxTeamMember}
        listUsers={allUsers}
        onOpenChange={() => setAddInboxTeamMember(null)}
        open={Boolean(addInboxTeamMember)}
      />
      <DeleteInboxTeamDialog
        chatbotId={chatbotId}
        inboxTeam={deleteInboxTeam}
        onOpenChange={() => setDeleteInboxTeam(null)}
        open={Boolean(deleteInboxTeam)}
      />
      <DeleteInboxTeamMembersDialog
        chatbotId={chatbotId}
        onOpenChange={() => setDeleteInboxTeamMember(null)}
        open={Boolean(deleteInboxTeamMember)}
        teamMember={deleteInboxTeamMember}
      />
    </>
  )
}

export function ListInboxTeams({ chatbotId, promises }: ListInboxTeamsProps) {
  const [{ data: allInboxTeams }, { data: allUsers }] = use(promises)

  return (
    <>
      <CreateInboxTeamDialog chatbotId={chatbotId} users={allUsers} />
      <ListInboxTeamsDetail
        allInboxTeams={allInboxTeams || []}
        allUsers={allUsers || []}
        chatbotId={chatbotId}
      />
    </>
  )
}
