import Link from "next/link";
import { SiteShell } from "@/components/site-shell";

export default function DashboardPage() {
  return (
    <SiteShell
      actions={
        <Link className="button-primary" href="/restaurant/upload">
          Add a menu
        </Link>
      }
      description="Restaurant management tools are planned for later. The menu reader is the focus right now."
      eyebrow="Restaurant tools"
      title="Restaurant tools are coming later."
    >
      <section className="grid gap-4 md:grid-cols-2">
        <article className="garden-bed menu-paper space-y-4 px-6 py-6">
          <h2 className="font-display text-2xl font-semibold">Draft menus</h2>
          <p className="text-sm leading-6 text-foreground-2">
            For now, use the menu reader while restaurant management waits for
            a later release.
          </p>
          <p className="tag">No menus yet</p>
        </article>

        <article className="garden-bed menu-paper space-y-4 px-6 py-6">
          <h2 className="font-display text-2xl font-semibold">Restaurant profile</h2>
          <p className="text-sm leading-6 text-foreground-2">
            Claiming and profile management are planned for a later release.
          </p>
          <p className="tag">Not enabled yet</p>
        </article>
      </section>
    </SiteShell>
  );
}
