"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@aha.chat/ui/components/ui/table"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { use, useState } from "react"
import type { getAllChatbotMembers } from "../../../features/users/queries"
import type { UserResource } from "../../../features/users/schemas/resource"
import { AddInboxTeamMemberDialog } from "./add-inbox-team-member-dialog"
import { CreateInboxTeamDialog } from "./create-inbox-team-dialog"
import { DeleteInboxTeamDialog } from "./delete-inbox-team-dialog"
import { DeleteInboxTeamMembersDialog } from "./delete-inbox-team-member-dialog"
import type { getInboxTeams } from "./queries"
import { RenameInboxTeamDialog } from "./rename-inbox-team-dialog"
import type { InboxTeamMemberResource, InboxTeamResource } from "./schema"

type ListInboxTeamsProps = {
  chatbotId: string
  promises: Promise<
    [
      Awaited<ReturnType<typeof getInboxTeams>>,
      Awaited<ReturnType<typeof getAllChatbotMembers>>,
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
  const t = useTranslations()
  const [renameInboxTeam, setRenameInboxTeam] =
    useState<InboxTeamResource | null>(null)
  const [deleteInboxTeam, setDeleteInboxTeam] =
    useState<InboxTeamResource | null>(null)
  const [addInboxTeamMember, setAddInboxTeamMember] =
    useState<InboxTeamResource | null>(null)
  const [deleteInboxTeamMember, setDeleteInboxTeamMember] =
    useState<InboxTeamMemberResource | null>(null)
  const [openTeams, setOpenTeams] = useState<Record<string, boolean>>({})

  const rows: Array<{ showMembers: boolean; team: InboxTeamResource }> = []
  for (const team of allInboxTeams) {
    rows.push({ showMembers: true, team })
    if (openTeams[team.id]) {
      rows.push({ showMembers: false, team })
    }
  }

  return (
    <>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-2.5" />
              <TableHead>{t("fields.team.label")}</TableHead>
              <TableHead>{t("fields.teamMembers.label")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row, _index) => {
                if (row.showMembers) {
                  return (
                    <TableRow key={row.team.id}>
                      <TableCell>
                        <Button
                          className="cursor-pointer"
                          onClick={() =>
                            setOpenTeams((prev) => ({
                              ...prev,
                              [row.team.id]: !prev[row.team.id],
                            }))
                          }
                          type="button"
                          variant="ghost"
                        >
                          {openTeams[row.team.id] ? (
                            <ChevronDownIcon size={16} />
                          ) : (
                            <ChevronRightIcon size={16} />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Button
                          className="cursor-pointer"
                          onClick={() =>
                            setOpenTeams((prev) => ({
                              ...prev,
                              [row.team.id]: !prev[row.team.id],
                            }))
                          }
                          type="button"
                          variant="ghost"
                        >
                          {row.team.name}
                        </Button>
                      </TableCell>
                      <TableCell>
                        {row.team.inboxTeamMembers?.length || 0}
                      </TableCell>
                      <TableCell className="w-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost">
                              <MoreHorizontalIcon className="h-4 w-4" />
                              <span className="sr-only">Open menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="flex flex-col gap-1 p-3">
                            <DropdownMenuItem
                              className="cursor-pointer text-sm"
                              onClick={() => setRenameInboxTeam(row.team)}
                            >
                              <PencilIcon />
                              {t("actions.rename")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer text-sm"
                              onClick={() => setAddInboxTeamMember(row.team)}
                            >
                              <PlusIcon />
                              {t("actions.addFeature", {
                                feature: t("fields.member.label"),
                              })}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer text-destructive text-sm"
                              onClick={() => setDeleteInboxTeam(row.team)}
                            >
                              <Trash2Icon />
                              {t("actions.delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                }
                return (
                  <TableRow key={`${row.team.id}-members`}>
                    <TableCell />
                    <TableCell colSpan={4}>
                      <ul className="pl-2">
                        {(row.team.inboxTeamMembers || []).map((member) => (
                          <li
                            className="flex items-center justify-between border-b py-2 last:border-b-0"
                            key={member.id}
                          >
                            <span>{member.user?.name}</span>
                            <Button
                              className="size-6 px-4"
                              onClick={() => setDeleteInboxTeamMember(member)}
                              size="icon"
                              variant="ghost"
                            >
                              <Trash2Icon className="text-destructive" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell className="h-24 text-center" colSpan={3}>
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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
  const t = useTranslations()
  const [{ data: allInboxTeams }, { data: allUsers }] = use(promises)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("fields.inboxTeam.label")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex justify-end">
          <CreateInboxTeamDialog chatbotId={chatbotId} users={allUsers} />
        </div>
        <ListInboxTeamsDetail
          allInboxTeams={allInboxTeams || []}
          allUsers={allUsers || []}
          chatbotId={chatbotId}
        />
      </CardContent>
    </Card>
  )
}
