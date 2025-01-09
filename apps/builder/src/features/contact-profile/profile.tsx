import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Contact } from "@prisma/client";

export default function ProfileAvatar(props: { contact: Contact }) {
  return (
    <>
      <div className="flex justify-center	items-center">
        <Avatar className="w-32	h-32">
          <AvatarImage
            src={props.contact.avatar as string}
            alt={props.contact.firstName as string}
          />
          <AvatarFallback>{props.contact.firstName}</AvatarFallback>
        </Avatar>
      </div>

      <div className="flex justify-center mt-4">
        <h3>
          {props.contact.firstName} {props.contact.lastName}
        </h3>
      </div>
    </>
  );
}
