"use client"

import { ConditionFieldType, ConditionOperator } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@aha.chat/ui/components/ui/dialog"
import { Input } from "@aha.chat/ui/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@aha.chat/ui/components/ui/popover"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import type { Condition, ConditionChild } from "./schemas/conditions-schema"
import { useConditions } from "./use-conditions"

type ConditionsProps = {
  open: boolean
  onOpenChange: (val: boolean) => void
  onSave: (condition: Condition) => void
}

export function ConditionsDialog(props: ConditionsProps) {
  const t = useTranslations()
  const [searchField, setSearchField] = useState("")
  const [currentOperator, setCurrentOperator] = useState<ConditionOperator>(
    ConditionOperator.is,
  )
  // biome-ignore lint/suspicious/noExplicitAny: wip
  const [value, setValue] = useState<any>(null)

  const { originalFields, filteredFieldList, operators } = useConditions({
    searchField,
  })
  const [currentField, setCurrentField] = useState<ConditionChild>(
    originalFields[0].children[0],
  )

  const currentFieldPreview = useMemo(() => {
    for (const group of originalFields) {
      for (const child of group.children) {
        if (child.field === currentField.field) {
          return child
        }
      }
    }
    return null
  }, [currentField, originalFields])

  const conditionValuesOptions = [
    { label: "True", value: "true" },
    { label: "False", value: "false" },
  ]

  const currentOperatorPreview = useMemo(() => {
    if (!currentOperator) {
      return null
    }
    return t(`condition.operators.${currentOperator}`)
  }, [currentOperator, t])

  const showInputTextValue = useMemo(
    () =>
      currentField.type === ConditionFieldType.string ||
      currentField.type === ConditionFieldType.number ||
      currentField.type === ConditionFieldType.datetime ||
      currentField.type === ConditionFieldType.date,
    [currentField],
  )

  const save = () => {
    props.onSave({
      field: currentField.field,
      operator: currentOperator as ConditionOperator,
      value,
    })
    props.onOpenChange(false)
  }

  return (
    <Dialog onOpenChange={props.onOpenChange} open={props.open}>
      <DialogContent className="!top-8 !translate-y-0 max-h-screen overflow-y-scroll lg:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t("condition.title")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center">
          <Popover>
            <PopoverTrigger asChild>
              <Button className="rounded-none" variant="outline">
                {currentFieldPreview?.label}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <Input
                className="flex-1"
                onChange={(e) => setSearchField(e.target.value)}
                value={searchField}
              />
              <div className="max-h-[300px] scroll-py-1 overflow-y-auto overflow-x-hidden">
                {filteredFieldList.map(
                  (group, groupIndex) =>
                    group.children.length > 0 && (
                      <div
                        className="flex flex-col border-b-1"
                        // biome-ignore lint/suspicious/noArrayIndexKey: index is unique
                        key={groupIndex}
                      >
                        {group.groupName && (
                          <div className="mt-4 mb-4 font-bold text-gray-600 text-sm">
                            {group.groupName}
                          </div>
                        )}
                        <div className="flex flex-col">
                          {group.children.map((children) => (
                            <Button
                              className={`w-full justify-start ${currentField.field === children.field ? "bg-blue-100" : ""}`}
                              key={children.field}
                              onClick={() => setCurrentField(children)}
                              variant="ghost"
                            >
                              {children.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ),
                )}
              </div>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button className="rounded-none" variant="outline">
                {currentOperatorPreview}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="flex flex-col">
                {operators.map((operator) => (
                  <Button
                    className="w-full justify-start"
                    key={operator}
                    onClick={() => setCurrentOperator(operator)}
                    variant="ghost"
                  >
                    {t(`condition.operators.${operator}`)}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {showInputTextValue && (
            <Input
              className="flex-1 rounded-none"
              onChange={(e) => setValue(e.target.value)}
              value={value || ""}
            />
          )}
          {!showInputTextValue && (
            <Popover>
              <PopoverTrigger asChild>
                <div className="flex-1 cursor-pointer rounded-none border-1 px-[12px] py-[5px] text-left">
                  {value || "..."}
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="flex flex-col">
                  {conditionValuesOptions.map((option) => (
                    <Button
                      className="w-full justify-start"
                      key={option.value}
                      onClick={() => setValue(option.value)}
                      variant="ghost"
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t("actions.cancel")}</Button>
          </DialogClose>
          <Button disabled={!(currentField && currentOperator)} onClick={save}>
            {t("actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
