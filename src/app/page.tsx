import { redirect } from "next/navigation";
import { currentMember, normalizeInviteCode } from "@/lib/auth";
import { Welcome } from "@/app/welcome";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  if (await currentMember()) redirect("/chat");

  const { code } = await searchParams;

  return <Welcome initialCode={code ? normalizeInviteCode(code) : ""} />;
}
