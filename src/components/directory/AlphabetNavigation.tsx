"use client";

import { useEffect, useState } from "react";
import { letterAnchor } from "@/lib/directory/urls";

const letters = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

export function AlphabetNavigation({ availableLetters }: { availableLetters: string[] }) {
  const [activeLetter, setActiveLetter] = useState(availableLetters[0] ?? "");

  useEffect(() => {
    const sections = availableLetters
      .map((letter) => document.getElementById(letterAnchor(letter)))
      .filter((section): section is HTMLElement => Boolean(section));
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const letter = visible?.target.getAttribute("data-letter");
        if (letter) setActiveLetter(letter);
      },
      { rootMargin: "-18% 0px -70%", threshold: 0 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [availableLetters]);

  return (
    <nav className="alphabet-navigation" aria-label="Jump to directory letter">
      {letters.map((letter) => {
        const enabled = availableLetters.includes(letter);
        return enabled ? (
          <a key={letter} href={`#${letterAnchor(letter)}`} className={activeLetter === letter ? "active" : undefined} aria-current={activeLetter === letter ? "location" : undefined}>{letter}</a>
        ) : (
          <span key={letter} aria-disabled="true">{letter}</span>
        );
      })}
    </nav>
  );
}
