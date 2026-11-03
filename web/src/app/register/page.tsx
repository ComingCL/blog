import { AuthForm } from "@/features/Account";
export const metadata = { title: "注册", robots: { index: false } };
export default function Page() {
  return <AuthForm register />;
}
