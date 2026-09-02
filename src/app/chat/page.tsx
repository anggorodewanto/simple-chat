import { redirect } from "next/navigation";
import { currentMember } from "@/lib/auth";
import { ChatRoom } from "@/app/chat/chat-room";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const member = await currentMember();
  if (!member) redirect("/");

  return <ChatRoom me={{ id: member.id, name: member.name, isAdmin: member.is_admin }} />;
}
