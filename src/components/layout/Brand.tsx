import Link from "next/link";

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Finding Sites home">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" role="img">
          <path d="M8 7.5h10.5A5.5 5.5 0 0 1 24 13v19H13.5A5.5 5.5 0 0 1 8 26.5z" />
          <path d="M32 7.5h-4A5.5 5.5 0 0 0 22.5 13v19l4.5-4 5 4z" />
          <circle cx="14.5" cy="15" r="3.2" />
          <path d="m16.8 17.3 3.6 3.6" />
        </svg>
      </span>
      <span>
        <strong>Finding Sites</strong>
        <small>Every Website. A Place to Be Found.</small>
      </span>
    </Link>
  );
}
