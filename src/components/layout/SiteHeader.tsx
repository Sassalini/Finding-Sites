import Link from "next/link";
import { Brand } from "@/components/layout/Brand";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { Icon } from "@/components/ui/Icon";
import { logoutAction } from "@/app/login/actions";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const navigation = [
  ["Browse Categories", "/categories"],
  ["How It Works", "/how-it-works"],
  ["List Your Website", "/submit"],
];

export async function SiteHeader() {
  const supabase = await getSupabaseServerClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand />
        <div className="header-search"><GlobalSearch /></div>
        <nav className="desktop-navigation" aria-label="Primary navigation">
          {navigation.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
          <Link href="/submit" className="button button-accent button-small">Submit a website</Link>
          {data.user ? <Link href="/account">Account</Link> : <Link href="/login">Log in</Link>}
        </nav>
        <details className="mobile-menu">
          <summary aria-label="Open navigation menu"><Icon name="menu" /></summary>
          <div className="mobile-menu-panel">
            <GlobalSearch compact />
            <nav aria-label="Mobile navigation">
              {navigation.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
              {data.user ? <Link href="/account">Account</Link> : <Link href="/login">Log in</Link>}
              <Link href="/submit" className="button button-accent">Submit a website</Link>
              {data.user && <form action={logoutAction}><button className="mobile-logout" type="submit">Log out</button></form>}
            </nav>
          </div>
        </details>
      </div>
    </header>
  );
}
