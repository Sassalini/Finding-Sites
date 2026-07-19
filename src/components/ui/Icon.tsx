import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { name: string };

export function Icon({ name, ...props }: IconProps) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  let content;

  switch (name) {
    case "search": content = <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>; break;
    case "briefcase": content = <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></>; break;
    case "monitor": content = <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></>; break;
    case "book": content = <><path d="M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 2z" /><path d="M20 5a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 2z" /></>; break;
    case "spark": content = <path d="m12 2 1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7z" />; break;
    case "pound": content = <><path d="M16 5.5a4 4 0 1 0-7 2.6V13" /><path d="M6 12h8M6 20h12M9 13c0 4-2 5-3 7" /></>; break;
    case "heart": content = <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8z" />; break;
    case "compass": content = <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></>; break;
    case "home": content = <><path d="m3 11 9-8 9 8" /><path d="M5 10v11h14V10M9 21v-7h6v7" /></>; break;
    case "leaf": content = <><path d="M20 4C11 4 5 8 5 15c0 3 2 5 5 5 7 0 10-7 10-16Z" /><path d="M4 21c3-5 7-8 12-11" /></>; break;
    case "news": content = <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h4v4H7zM14 8h3M14 12h3M7 16h10" /></>; break;
    case "paw": content = <><circle cx="12" cy="15" r="4" /><circle cx="5.5" cy="10" r="2" /><circle cx="9" cy="5.5" r="2" /><circle cx="15" cy="5.5" r="2" /><circle cx="18.5" cy="10" r="2" /></>; break;
    case "bag": content = <><path d="M5 8h14l-1 13H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>; break;
    case "people": content = <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2" /><path d="M3 20c0-4 2-7 6-7s6 3 6 7M15 14c3 0 5 2 5 6" /></>; break;
    case "activity": content = <path d="M3 12h4l2-7 4 14 2-7h6" />; break;
    case "map": content = <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z" /><path d="M9 3v15M15 6v15" /></>; break;
    case "folder": content = <path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />; break;
    case "sort": content = <><path d="M4 6h16M7 12h10M10 18h4" /></>; break;
    case "eye": content = <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>; break;
    case "clock": content = <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>; break;
    case "trend": content = <><path d="m3 17 6-6 4 4 8-9" /><path d="M15 6h6v6" /></>; break;
    case "shuffle": content = <><path d="M16 3h5v5M4 20l5-5M21 3l-7 7M16 16l5 5M21 16v5M4 4l5 5" /></>; break;
    case "external": content = <><path d="M14 3h7v7M10 14 21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></>; break;
    case "check": content = <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>; break;
    case "menu": content = <path d="M4 6h16M4 12h16M4 18h16" />; break;
    case "arrow-down": content = <path d="M12 4v16m-6-6 6 6 6-6" />; break;
    default: content = <circle cx="12" cy="12" r="8" />;
  }

  return <svg aria-hidden="true" viewBox="0 0 24 24" {...common} {...props}>{content}</svg>;
}
