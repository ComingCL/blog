import { CollectionKind } from "@/models/enums";
import { Collections } from "@/features/Collections";

export const metadata = { title: "我的收藏" };

export default function Page() {
  return <Collections kind={CollectionKind.Bookmarks} />;
}
