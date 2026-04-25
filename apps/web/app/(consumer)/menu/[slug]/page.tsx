import { SiteShell } from "@/components/site-shell";
import { PublicMenuView } from "@/components/public-menu-view";

type MenuPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function MenuPage({ params }: MenuPageProps) {
  const { slug } = await params;

  return (
    <SiteShell
      description="Browse menu sections, items, prices, and dietary notes in a screen-reader-friendly format."
      eyebrow="Menu"
      title="Accessible menu"
    >
      <PublicMenuView identifier={slug} />
    </SiteShell>
  );
}
