import { MenuChat } from "@/components/menu-chat";

type ChatPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ChatPage({ params }: ChatPageProps) {
  const { id } = await params;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="sr-only">Ask a menu question</h1>
      <MenuChat menuId={id} />
    </div>
  );
}
