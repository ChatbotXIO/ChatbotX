"use client"

import { use, useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type {
  getOpenAIAgents,
  getOpenAIIntegration,
} from "@/features/integrations/open-ai/queries"
import {
  EllipsisVerticalIcon,
  TypeIcon,
  Trash2Icon,
  CopyIcon,
  PlusCircleIcon,
} from "lucide-react"
import IntegrationDialogAdd from "@/features/integrations/components/dialog/add"
import IntegrationDialogDelete from "@/features/integrations/components/dialog/delete"
import { createNewPrompt } from "@/features/integrations/open-ai/queries"
import { T } from "@tolgee/react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"

type OpenAIPromptTableProps = {
  promises: Promise<
    [
      Awaited<ReturnType<typeof getOpenAIIntegration>>,
      Awaited<ReturnType<typeof getOpenAIAgents>>,
    ]
  >
}

export default function OpenAIPromptTable({
  promises,
}: OpenAIPromptTableProps) {
  const [integration, prompts] = use(promises)
  const router = useRouter()
  const [activePopover, setActivePopover] = useState("")

  const onAdd = async (name: string) => {
    await createNewPrompt({ name })
    console.log("Add Name")
    setActivePopover("")
  }

  const onRemove = () => {
    console.log("onRemove")
    setActivePopover("")
  }

  const onEdit = (id: string) => {
    router.push(`./openai-prompts/${id}`)
  }

  return (
    <div className="border rounded-md">
      <div className="border-b p-2 flex items-center justify-between">
        <h1 className="text-2xl">Agents</h1>
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
      {integration?.data?.isConnect ? (
        <div className="p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Modified</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {prompts?.data?.map((prompt, index) => (
                <TableRow
                  key={prompt.id}
                  className="cursor-pointer hover:bg-slate-200"
                  onClick={() => onEdit(prompt.id as string)}
                >
                  <TableCell>{prompt.name}</TableCell>
                  <TableCell>{prompt.update_at}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Popover open={activePopover === prompt.id}>
                      <PopoverTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          onMouseEnter={() =>
                            setActivePopover(prompt.id as string)
                          }
                        >
                          <EllipsisVerticalIcon />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[200px] p-0"
                        onMouseLeave={() => setActivePopover("")}
                      >
                        <div className="flex flex-col">
                          <IntegrationDialogAdd
                            title="Rename"
                            oldName={prompt.name as string}
                            button={
                              <div className="flex items-center gap-2 p-2 border-b cursor-pointer text-gray-300 hover:bg-slate-200 hover:text-black">
                                <TypeIcon size={15} />
                                <p>Rename</p>
                              </div>
                            }
                            save={onAdd}
                          />

                          <div className="flex items-center gap-2 p-2 border-b cursor-pointer text-gray-300 hover:bg-slate-200 hover:text-black">
                            <CopyIcon size={15} />
                            <p>Duplicate</p>
                          </div>

                          <IntegrationDialogDelete
                            title="One item will be deleted. You can't undo this action."
                            id={prompt.id as string}
                            button={
                              <div className="flex items-center gap-2 p-2 border-b cursor-pointer text-gray-300 hover:bg-slate-200 hover:text-red-500">
                                <Trash2Icon size={15} />
                                <p>Delete</p>
                              </div>
                            }
                            remove={onRemove}
                          />
                        </div>
                      </PopoverContent>
                    </Popover>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="mb-2">
          AI agents give you control over how AI answers customers based on your
          business information.
        </p>
      )}
    </div>
  )
}
