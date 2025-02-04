"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AssignConversationSchema } from "@/features/conversations/schemas/assign-conversation-schema"
import { AssignedType, type Team, type User } from "@ahachat.ai/database"
import { useTranslate } from "@tolgee/react"
import React, { useState, useTransition } from "react"

export function AssignConversationDialog({
  chatbotId,
  users,
  teams,
  open,
  onOpenChange,
  onSubmit,
}: {
  chatbotId: string
  users: User[]
  teams: Team[]
  open: boolean
  onOpenChange: (val: boolean) => void
  onSubmit: (
    schema: Pick<AssignConversationSchema, "assignedId" | "assignedType">,
  ) => void
}) {
  const { t } = useTranslate()

  const [assigner, setAssigner] = useState<string>("")
  const [isPending, startTransition] = useTransition()

  const onSubmitted = async () => {
    startTransition(() => {
      if (assigner === "unassign") {
        return onSubmit({
          assignedId: null,
          assignedType: null,
        })
      }
      const [assignedType, assignedId] = assigner.split("_") as [
        AssignedType,
        string,
      ]

      onSubmit({
        assignedId,
        assignedType,
      })
      startTransition(() => onOpenChange(false))
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("flows.ActionType.AssignConversation")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Select
            value={assigner}
            onValueChange={(value) => setAssigner(value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("common.select")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassign">
                {t("flows.ActionType.UnassignConversation")}
              </SelectItem>
              <SelectGroup>
                <SelectLabel>User</SelectLabel>
                {users.map((user) => (
                  <SelectItem
                    value={`${AssignedType.User}_${user.id}`}
                    key={user.id}
                  >
                    {user.name}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Team</SelectLabel>
                {teams.map((team) => (
                  <SelectItem
                    value={`${AssignedType.Team}_${team.id}`}
                    key={team.id}
                  >
                    {team.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel-btn")}
          </Button>
          <Button
            type="submit"
            disabled={!assigner || isPending}
            onClick={() => onSubmitted()}
          >
            {t("common.confirm-btn")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
