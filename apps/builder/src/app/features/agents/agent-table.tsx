"use client";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Circle, CircleCheck, EllipsisVertical, Mail } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useTranslate } from "@tolgee/react";
import { AgentDialog } from "./agent-dialog";

interface Agent {
  id: number;
  name: string;
  avatar: string;
  contacts: boolean;
  analytics: boolean;
  flows: boolean;
  settings: boolean;
  notifications: boolean;
}

export function AgentTable({ data }: { data: Agent[] }) {
  const { t } = useTranslate();
  return (
    <Table className="border-2 rounded-2xl border-separate border-gray-100">
      <TableCaption>
        {" "}
        <div className="flex justify-center items-center space-x-2 mb-2">
          <Checkbox id="terms" />
          <label
            htmlFor="terms"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Advanced Mode
          </label>
        </div>
        Admin Activity Logs
      </TableCaption>
      <thead >
        <tr >
          <td colSpan={8}>
            <div className="flex justify-between items-center m-4">
              <h1 className="text-xl font-semibold">{t("common.admins")}</h1>
              <AgentDialog/>            
            </div>
          </td>
        </tr>
      </thead>
    
      <TableHeader>
        <TableRow>
          <TableHead></TableHead>
          <TableHead className="text-center">{t("common.name")}</TableHead>
          <TableHead className="text-center">{t("common.contacts")}</TableHead>
          <TableHead className="text-center">{t("common.analytics")}</TableHead>
          <TableHead className="text-center">{t("common.flows")}</TableHead>
          <TableHead className="text-center">{t("common.settings")}</TableHead>
          <TableHead className="text-center">
            {t("common.notifications")}
          </TableHead>
          <TableHead className="text-center"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((agent) => (
          <TableRow key={agent.id}>
            <TableCell>
              <Avatar className="w-12 h-12 rounded-full">
                <AvatarImage src="" alt={agent.name} />
                <AvatarFallback>
                  {agent.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </TableCell>
            <TableCell className="text-center">{agent.name}</TableCell>
            <TableCell className="text-center">
              {agent.contacts ? (
                <CircleCheck className="inline-block" />
              ) : (
                <Circle className="inline-block" />
              )}
            </TableCell>
            <TableCell className="text-center">
              {agent.analytics ? (
                <CircleCheck className="inline-block" />
              ) : (
                <Circle className="inline-block" />
              )}
            </TableCell>

            <TableCell className="text-center">
              {agent.flows ? (
                <CircleCheck className="inline-block" />
              ) : (
                <Circle className="inline-block" />
              )}
            </TableCell>
            <TableCell className="text-center">
              {agent.settings ? (
                <CircleCheck className="inline-block" />
              ) : (
                <Circle className="inline-block" />
              )}
            </TableCell>
            <TableCell className="text-center">
              {agent.notifications ? (
                <Mail className="inline-block" />
              ) : (
                "Disable"
              )}
            </TableCell>
            <TableCell>
              <EllipsisVertical />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
