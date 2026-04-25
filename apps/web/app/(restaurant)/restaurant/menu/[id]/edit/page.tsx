import { SiteShell } from "@/components/site-shell";

type EditPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditMenuPage({ params }: EditPageProps) {
  const { id } = await params;

  return (
    <SiteShell
      description="Menu editing tools are planned for a later release."
      eyebrow="Menu editing"
      title={`Menu editing for ${id}`}
    >
      <section className="garden-bed menu-paper space-y-4 px-6 py-6">
        <h2 className="font-display text-3xl font-semibold">Review checklist</h2>
        <ul className="space-y-3 pl-5 text-base leading-7 text-foreground-2 marker:text-accent">
          <li>Category order and naming</li>
          <li>Item descriptions and prices</li>
          <li>Allergens and dietary tags</li>
          <li>Publish status and last edited timestamp</li>
        </ul>
      </section>
    </SiteShell>
  );
}
