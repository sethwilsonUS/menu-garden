import { currentUser } from "@clerk/nextjs/server";
import type { ReactNode } from "react";
import { SiteShell } from "@/components/site-shell";
import { resolveRole } from "@/lib/auth";

export default async function RestaurantLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await currentUser();
  const role = resolveRole(user?.publicMetadata);

  if (role !== "restaurant_owner") {
    return (
      <SiteShell
        description="Restaurant tools are not part of the public menu reader yet."
        eyebrow="Owner access"
        title="Restaurant tools are coming later."
      >
        <section className="garden-bed menu-paper space-y-4 px-6 py-6">
          <h2 className="font-display text-3xl font-semibold">Not available yet</h2>
          <p className="text-base leading-7 text-foreground-2">
            For now, Menu Garden is focused on helping diners add a menu, read it,
            and ask questions.
          </p>
        </section>
      </SiteShell>
    );
  }

  return children;
}
