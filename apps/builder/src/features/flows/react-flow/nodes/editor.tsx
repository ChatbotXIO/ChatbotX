import {
  disabledCopyActionTypes,
  type FlowNode,
  type NodeType,
  StepType,
} from "@aha.chat/flow-config"
import { TriggerFormInitially } from "@aha.chat/ui/components/form/form-trigger-initially"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { Form } from "@aha.chat/ui/components/ui/form"
import { Separator } from "@aha.chat/ui/components/ui/separator"
import {
  Sortable,
  SortableContent,
  SortableItem,
  SortableItemHandle,
} from "@aha.chat/ui/components/ui/sortable"
import { cn } from "@aha.chat/ui/lib/utils"
import { zodResolver } from "@hookform/resolvers/zod"
import { createId } from "@paralleldrive/cuid2"
import { T } from "@tolgee/react"
import { useReactFlow } from "@xyflow/react"
import { CopyIcon, MoveVerticalIcon, PlusIcon, XIcon } from "lucide-react"
import { useEffect } from "react"
import { useFieldArray, useForm, useWatch } from "react-hook-form"
import { funnel } from "remeda"
import { z } from "zod"
import { InboxSelect } from "@/features/inboxes/inbox-select"
import RecursiveDropdownMenu from "../components/recursive-dropdown-menu"
import { allSteps, DynamicStepEditor } from "../steps"
import { ErrorAlert } from "../steps/error-alert"
import { allNodesConfig } from "./node-config"

export function NodeEditor({ activeNode }: { activeNode: FlowNode }) {
  const { updateNodeData } = useReactFlow()
  const nodeConfig = activeNode.type
    ? allNodesConfig[activeNode.type as NodeType]
    : null

  const form = useForm({
    resolver: zodResolver(nodeConfig ? nodeConfig.validator : z.object({})),
    defaultValues: {
      ...activeNode.data,
    },
    mode: "onBlur",
  })
  const { control, getValues } = form

  const allValues = useWatch({ control })
  const debounceUpdateNodeData = funnel(
    () => {
      updateNodeData(activeNode.id, allValues)
    },
    { minQuietPeriodMs: 100 },
  )
  useEffect(() => {
    debounceUpdateNodeData.call()
  }, [debounceUpdateNodeData])

  const { fields, append, move, remove, insert } = useFieldArray({
    control,
    name: "steps",
  })

  const onAddStep = (name: StepType) => {
    const newStep = allSteps[name]?.defaultFn()
    if (newStep) {
      append(newStep)
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: wip
  function replaceIds(data: any): any {
    if (typeof data === "object" && data !== null) {
      if (Array.isArray(data)) {
        return data.map((item) => replaceIds(item))
      }

      // biome-ignore lint/suspicious/noExplicitAny: wip
      const newData: any = {}
      for (const key in data) {
        if (key === "id") {
          newData[key] = createId()
        } else {
          newData[key] = replaceIds(data[key])
        }
      }
      return newData
    }
    return data
  }

  const onCopyStep = (index: number) => {
    const values = getValues(`steps.${index}`)
    if (values) {
      insert(index + 1, replaceIds(values))
    }
  }

  const onRemoveStep = (index: number) => {
    remove(index)
  }

  return (
    <Form {...form}>
      <InputField label="Node Name" name="name" />

      <Separator />

      <InboxSelect name={"inboxType"} />

      {/* <Separator /> */}

      <div className="my-2 flex flex-1 flex-col gap-2 overflow-y-auto">
        <Sortable
          getItemValue={(item) => item.id}
          onMove={({ activeIndex, overIndex }) => move(activeIndex, overIndex)}
          value={fields}
        >
          <SortableContent asChild>
            <div className="flex w-full flex-col gap-4">
              {fields.map((field, index) => (
                <SortableItem asChild key={field.id} value={field.id}>
                  <div
                    className={cn(
                      "flex items-center gap-2",
                      // biome-ignore lint/suspicious/noExplicitAny: wip
                      (field as any).stepType === StepType.SEND_CAROUSEL
                        ? "relative"
                        : "",
                    )}
                  >
                    {form.formState.errors.steps ? (
                      <ErrorAlert
                        message={
                          JSON.stringify(form.formState.errors)
                          // typeof form.formState.errors.steps?.[index]?.message ===
                          //   "object"
                          //   ? ((
                          //     form.formState.errors.steps?.[index]?.message as {
                          //       message: string
                          //     }
                          //   ).message as string)
                          //   : ""
                        }
                      />
                    ) : (
                      <div className="w-4">{"\u00A0"}</div>
                    )}
                    <div
                      className={cn(
                        "flex-1 break-all",
                        // biome-ignore lint/suspicious/noExplicitAny: wip
                        (field as any).stepType === StepType.SEND_CAROUSEL
                          ? "overflow-hidden"
                          : "",
                      )}
                    >
                      <DynamicStepEditor
                        key={field.id}
                        parentName={`steps.${index}`}
                        // biome-ignore lint/suspicious/noExplicitAny: wip
                        type={(field as any).stepType}
                      />
                    </div>
                    <div className="flex flex-col">
                      <Button
                        className="size-8 shrink-0"
                        onClick={() => onRemoveStep(index)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <XIcon aria-hidden="true" className="size-4" />
                      </Button>

                      <SortableItemHandle asChild>
                        <Button className="size-8" size="icon" variant="ghost">
                          <MoveVerticalIcon className="h-4 w-4" />
                        </Button>
                      </SortableItemHandle>
                      {!disabledCopyActionTypes.includes(
                        // biome-ignore lint/suspicious/noExplicitAny: wip
                        (field as any).stepType,
                      ) && (
                        <Button
                          className="size-8 shrink-0"
                          onClick={() => onCopyStep(index)}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <CopyIcon aria-hidden="true" className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </SortableItem>
              ))}
            </div>
          </SortableContent>
        </Sortable>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <PlusIcon />
            <T keyName="flows.addStep" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-full">
          <RecursiveDropdownMenu
            data={nodeConfig ? nodeConfig.menus : []}
            onClick={onAddStep}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <TriggerFormInitially form={form} />
    </Form>
  )
}
