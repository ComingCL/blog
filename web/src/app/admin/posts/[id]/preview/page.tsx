import { DraftPreview } from "@/features/Admin";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DraftPreview id={id} />;
}
