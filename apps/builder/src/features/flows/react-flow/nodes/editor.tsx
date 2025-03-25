import { cn } from "@/components/lib/utils"
import { Button } from "@/components/ui/button"
import { Form, TriggerFormInitially } from "@/components/ui/form"
import { Separator } from "@/components/ui/separator"
import {
  Sortable,
  SortableDragHandle,
  SortableItem,
} from "@/components/ui/sortable"
import { zodResolver } from "@hookform/resolvers/zod"
import { createId } from "@paralleldrive/cuid2"
import { useReactFlow } from "@xyflow/react"
import { funnel } from "remeda"
import { CopyIcon, MoveVerticalIcon, PlusIcon, XIcon } from "lucide-react"
import { useEffect } from "react"
import { useFieldArray, useForm, useWatch } from "react-hook-form"
import { StepType, disabledCopyActionTypes } from "../steps/step-action"
import { allSteps, DynamicStepEditor } from "../steps"
import { ErrorAlert } from "../steps/error-alert"
import { FormInput } from "@/components/form-input"
import { allNodesConfig } from "./node-config"
import type { FlowNode, NodeType } from "../types"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import RecursiveDropdownMenu from "../components/recursive-dropdown-menu"
import { T } from "@tolgee/react"

export function NodeEditor({ activeNode }: { activeNode: FlowNode }) {
  const { updateNodeData } = useReactFlow()
  const nodeConfig = allNodesConfig[activeNode.type as NodeType]

  const form = useForm<typeof nodeConfig.validator>({
    resolver: zodResolver(nodeConfig.validator),
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

  // @ts-ignore
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

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  function replaceIds(data: any): any {
    if (typeof data === "object" && data !== null) {
      if (Array.isArray(data)) {
        return data.map((item) => replaceIds(item))
      }

      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
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
      <FormInput name="name" label="Node Name" />

      <Separator />

      {/* <InboxSelect name={"messageType"} /> */}

      {/* <Separator /> */}

      <div className="flex flex-col flex-1 gap-2 my-2 overflow-y-auto">
        <Sortable
          value={fields}
          onMove={({ activeIndex, overIndex }) => move(activeIndex, overIndex)}
          overlay={<div className="w-full h-32 rounded-sm bg-primary/10" />}
        >
          <div className="flex w-full flex-col gap-4">
            {fields.map((field, index) => (
              <SortableItem key={field.id} value={field.id} asChild>
                <div
                  className={cn(
                    "flex gap-2 items-center",
                    field.stepType === StepType.SendCarousel ? "relative" : "",
                  )}
                >
                  {form.formState.errors.steps?.[index] ? (
                    <ErrorAlert
                      message={
                        typeof form.formState.errors.steps?.[index]?.message ===
                        "object"
                          ? ((
                              form.formState.errors.steps?.[index]?.message as {
                                message: string
                              }
                            ).message as string)
                          : ""
                      }
                    />
                  ) : (
                    <div className="w-4">{"\u00A0"}</div>
                  )}
                  <div
                    className={cn(
                      "flex-1 break-all",
                      field.stepType === StepType.SendCarousel
                        ? "overflow-hidden"
                        : "",
                    )}
                  >
                    <DynamicStepEditor
                      type={field.stepType}
                      key={field.id}
                      parentName={`steps.${index}`}
                    />
                  </div>
                  <div className="flex flex-col">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      onClick={() => onRemoveStep(index)}
                    >
                      <XIcon className="size-4" aria-hidden="true" />
                    </Button>
                    <SortableDragHandle
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                    >
                      <MoveVerticalIcon className="size-4" aria-hidden="true" />
                    </SortableDragHandle>
                    {!disabledCopyActionTypes.includes(field.stepType) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                        onClick={() => onCopyStep(index)}
                      >
                        <CopyIcon className="size-4" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </div>
              </SortableItem>
            ))}
          </div>
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
          <RecursiveDropdownMenu data={nodeConfig.menus} onClick={onAddStep} />
        </DropdownMenuContent>
      </DropdownMenu>

      <TriggerFormInitially form={form} />
    </Form>
  )
}
