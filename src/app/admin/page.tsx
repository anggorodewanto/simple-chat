import { redirect } from "next/navigation";
import { currentMember } from "@/lib/auth";
import { AdminPanel } from "@/app/admin/admin-panel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const member = await currentMember();
  if (!member) redirect("/");
  if (!member.is_admin) redirect("/chat");

  return <AdminPanel />;
}
