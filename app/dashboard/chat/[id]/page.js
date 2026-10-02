import AIWorkspace from "@/components/AIWorkspace";

export const metadata = { title: "Chat" };

export default async function Page({ params }) {
  const { id } = await params;
  return <AIWorkspace chatId={id} />;
}
