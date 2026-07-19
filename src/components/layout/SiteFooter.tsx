import Link from "next/link";

const footerLinks = [
  ["About", "/about"],
  ["Contact", "/contact"],
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
  ["Cookie Policy", "/cookies"],
  ["Community Guidelines", "/community-guidelines"],
  ["Submit a Website", "/submit"],
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <p>© {new Date().getFullYear()} Finding Sites. Built for useful discovery.</p>
        <nav aria-label="Footer navigation">
          {footerLinks.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}
        </nav>
      </div>
    </footer>
  );
}
