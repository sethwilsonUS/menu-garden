import Link from "next/link";
import { PublicMenuList } from "@/components/public-menu-list";
import { SiteShell } from "@/components/site-shell";

export default function MenusPage() {
  return (
    <SiteShell
      actions={
        <Link className="button-primary" href="/">
          Add a menu
        </Link>
      }
      description="Browse accessible menus that people have chosen to save publicly."
      eyebrow="Browse"
      title="Public menus"
    >
      <PublicMenuList />
    </SiteShell>
  );
}
