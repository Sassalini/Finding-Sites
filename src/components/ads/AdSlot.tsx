import type { ReactNode } from "react";

const advertisingEnabled = process.env.NEXT_PUBLIC_ADVERTISING_ENABLED === "true";

function AdSlot({ className, children }: { className: string; children?: ReactNode }) {
  if (!advertisingEnabled) return null;
  return (
    <aside className={`ad-slot ${className}`} aria-label="Advertisement">
      <span>Advertisement</span>
      {children ?? <p>Reserved advertising space</p>}
    </aside>
  );
}

export function DesktopSideAdSlot() {
  return <AdSlot className="desktop-side-ad" />;
}

export function MobileInlineAdSlot() {
  return <AdSlot className="mobile-inline-ad" />;
}

export function DirectoryAdPlaceholder({ children }: { children?: ReactNode }) {
  return <AdSlot className="directory-ad-placeholder">{children}</AdSlot>;
}
