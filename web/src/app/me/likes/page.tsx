import { CollectionKind } from "@/models/enums";
import { Collections } from "@/features/Collections";
export default function Page() {
  return <Collections kind={CollectionKind.Likes} />;
}
