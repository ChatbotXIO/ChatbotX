"use client";

import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import React from "react";
import { GenerateCustomFieldForm } from "./create/create-field-form";
import { Field } from "./create/create-field-schema";

export const AddCustomField = (props: {
  contactId: string;
  chatbotId: string;
  customFields: Field[];
  onCustomFieldAdded: (customField: Field) => void;
}) => {
  const [isNewCustomField, setIsNewCustomField] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [_customField, setCustomField] = React.useState(props.customFields);

  const selectCustomField = (field: Field) => {
    setOpen(false);
    props.onCustomFieldAdded(field);
    setCustomField(_customField.filter((f) => f.id !== field.id));
  };

  const onFieldAdded = (field: Field) => {
    setIsNewCustomField(false);
    setCustomField([..._customField, field]);
  };

  return (
    <Popover open={open}>
      <PopoverTrigger onClick={() => setOpen(true)}>Add new</PopoverTrigger>
      <PopoverContent
        className="w-[350px] p-0"
        onPointerDownOutside={() => setOpen(false)}
      >
        {isNewCustomField ? (
          <div>
            <GenerateCustomFieldForm
              onAdded={onFieldAdded}
              chatbotId={props.chatbotId}
              setIsNewCustomField={setIsNewCustomField}
            />
          </div>
        ) : (
          <div>
            <CardHeader className="flex justify-between flex-row items-center">
              <CardTitle className="text-center">Custom Fields</CardTitle>
              <Button onClick={() => setIsNewCustomField(true)}>Add New</Button>
            </CardHeader>
            <CardContent>
              <form>
                <div className="grid w-full items-center gap-4">
                  <div className="flex flex-col space-y-1.5 cursor-pointer	">
                    {_customField.map((field) => (
                      <div
                        key={field.id}
                        onClick={() => selectCustomField(field)}
                      >
                        {field.name}
                      </div>
                    ))}
                  </div>
                </div>
              </form>
            </CardContent>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
