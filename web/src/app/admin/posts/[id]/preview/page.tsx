import { DraftPreview } from "@/features/Admin";

export const metadata = { title: "草稿预览" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DraftPreview id={id} />;
}
