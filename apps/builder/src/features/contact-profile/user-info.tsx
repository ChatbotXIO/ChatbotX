"use client";

import { Contact } from "@prisma/client";
import React from "react";
import { ContactInfoField } from "./contact-info-field";
import { AddCustomField } from "./add-custom-field";
import {
  CustomFieldType,
  Field,
  FieldType,
} from "./create/create-field-schema";

export default function UserInfo(props: {
  contact: Contact;
  contactFields: Field[];
  fields: Field[];
  chatbotId: string;
}) {
  const [fields, setFields] = React.useState(props.contactFields);
  const onCustomFieldAdded = (field: Field) => {
    setFields([...fields, field]);
  };

  const onRemoveCustomField = (contactCustomField: Field) => {
    setFields(fields.filter((field) => field.id !== contactCustomField.id));
  };

  return (
    <>
      <div className="flex">
        <span className="w-28 font-semibold truncate">Email</span>
        <ContactInfoField
          fieldType={FieldType.AccountField}
          contactId={props.contact.id}
          contactField={{
            id: "email",
            name: "email",
            value: props.contact.email as string,
            customFieldType: CustomFieldType.ShortText,
          }}
        ></ContactInfoField>
      </div>

      <div className="flex">
        <span className="w-28 font-semibold truncate">Phone</span>
        <ContactInfoField
          fieldType={FieldType.AccountField}
          contactId={props.contact.id}
          contactField={{
            id: "phone",
            name: "phoneNumber",
            value: props.contact.phoneNumber as string,
            customFieldType: CustomFieldType.ShortText,
          }}
        ></ContactInfoField>
      </div>

      <div className="flex">
        <span className="w-28 font-semibold truncate">Local time</span>
        <p className="text-secondary-foreground rounded-md break-words max-w-full whitespace-pre-wrap">
          {new Date().getHours().toString().padStart(2, "0")}:
          {new Date().getMinutes().toString().padStart(2, "0")}
        </p>
      </div>

      {fields.map((field) => {
        return (
          <div key={field.id} className="flex">
            <span className="w-28 font-semibold truncate">{field.name}</span>
            <ContactInfoField
              fieldType={FieldType.CustomField}
              contactId={props.contact.id}
              contactField={field}
              onRemoveCustomField={onRemoveCustomField}
            ></ContactInfoField>
          </div>
        );
      })}

      <div className="mt-4">
        <AddCustomField
          contactId={props.contact.id}
          chatbotId={props.chatbotId}
          onCustomFieldAdded={onCustomFieldAdded}
          customFields={props.fields}
        />
      </div>
    </>
  );
}
