"use client"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import IntegrationDialogAdd from "@/features/integrations/components/dialog/add"
import IntegrationDialogDelete from "@/features/integrations/components/dialog/delete"
import type {
  getOpenAIAssistants,
  getOpenAIIntegration,
} from "@/features/integrations/open-ai/queries"
import { T } from "@tolgee/react"
import { EllipsisVerticalIcon, PlusCircleIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { use, useState } from "react"

type OpenAIAssistantTableProps = {
  promises: Promise<
    [
      Awaited<ReturnType<typeof getOpenAIIntegration>>,
      Awaited<ReturnType<typeof getOpenAIAssistants>>,
    ]
  >
}

export default function OpenAIAssistantTable({
  promises,
}: OpenAIAssistantTableProps) {
  const router = useRouter()
  const [integration, assistants] = use(promises)
  const [activePopover, setActivePopover] = useState("")

  console.log(integration, assistants)

  const onAdd = async (name: string) => {
    console.log("Add Name")
  }

  const onRemove = () => {
    console.log("onRemove")
    setActivePopover("")
  }

  const onEdit = (id: string) => {
    router.push(`./openai-assistants/${id}`)
  }

  return (
    <div className="border rounded-md">
      <div className="border-b p-2 flex items-center justify-between">
        <h1 className="text-2xl">Assistants</h1>
        <div className="">
          <IntegrationDialogAdd
            title="Add New"
            save={onAdd}
            button={
              <Button className="min-w-[250px]">
                <PlusCircleIcon />
                <T keyName="settings.integrations.button.add" />
              </Button>
            }
          />
        </div>
      </div>
      <div className="p-2">
        {integration?.data?.isConnect ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Modified</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {assistants.data.map((item) => (
                <TableRow
                  key={item.id}
                  className="cursor-pointer hover:bg-slate-200"
                  onClick={() => onEdit(item.id as string)}
                >
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.update_at}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Popover open={activePopover === item.id}>
                      <PopoverTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          onMouseEnter={() =>
                            setActivePopover(item.id as string)
                          }
                        >
                          <EllipsisVerticalIcon />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[200px] p-0"
                        onMouseLeave={() => setActivePopover("")}
                      >
                        <IntegrationDialogDelete
                          title="One item will be deleted. You can't undo this action."
                          id={item.id as string}
                          button={
                            <div className="flex items-center gap-2 p-2 border-b cursor-pointer text-gray-300 hover:bg-slate-200 hover:text-red-500">
                              <Trash2Icon size={15} />
                              <p>Delete</p>
                            </div>
                          }
                          remove={onRemove}
                        />
                      </PopoverContent>
                    </Popover>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="">
            Assistants are similar to AI agents. Use it when you want to use a
            large amount of data on files.
          </p>
        )}
      </div>
    </div>
  )
}
