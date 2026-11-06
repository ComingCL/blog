import { CollectionKind } from "@/models/enums";
import { Collections } from "@/features/Collections";

export const metadata = { title: "我的点赞" };

export default function Page() {
  return <Collections kind={CollectionKind.Likes} />;
}
