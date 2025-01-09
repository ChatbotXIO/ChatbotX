"use client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import React from "react";
import { format } from "date-fns";
import { GenerateUpdateContactForm } from "./update/update-contact-form";
import { UpdateContactSchema } from "./update/update-contact-schema";
import {
  CustomFieldType,
  Field,
  FieldType,
} from "./create/create-field-schema";

const transformValue = (contactField: Field): string => {
  if (!contactField.value) {
    return "";
  }
  switch (contactField.customFieldType) {
    case CustomFieldType.ShortText:
    case CustomFieldType.Number:
      return contactField.value as string;
    case CustomFieldType.LongText:
      return contactField.value as string;
    case CustomFieldType.Date:
      return format(new Date(contactField.value as string), "dd/MM/yyyy");
    case CustomFieldType.DateTime:
      return format(new Date(contactField.value as string), "dd/MM/yyyy HH:mm");
    case CustomFieldType.Boolean:
      return contactField.value === "1" ? "True" : "False";
    default:
      return contactField.value as string;
  }
};



export const ContactInfoField = (props: {
  contactId: string;
  fieldType: FieldType;
  contactField: Field;
  fieldName?: string;
  onRemoveCustomField?: (contactCustomField: Field) => void;
}) => {
  const [open, setOpen] = React.useState(false);
  const [displayValue, setDisplayValue] = React.useState(
    transformValue(props.contactField),
  );

  return (
    <Popover open={open}>
      <PopoverTrigger onClick={() => setOpen(true)}>
        {displayValue ? displayValue : "---edit---"}
      </PopoverTrigger>
      <PopoverContent
        onPointerDownOutside={() => setOpen(false)}
        className="w-[350px] p-0"
      >
        <GenerateUpdateContactForm
          contactField={props.contactField}
          fieldType={props.fieldType}
          contactId={props.contactId}
          onChange={(formValues: UpdateContactSchema) => {
            props.contactField.value = formValues.value;
            setDisplayValue(transformValue(props.contactField));
          }}
          setOpen={setOpen}
        />
      </PopoverContent>
    </Popover>
  );
};
