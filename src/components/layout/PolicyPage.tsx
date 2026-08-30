import type { ReactNode } from "react";
import styles from "./PolicyPage.module.css";

type PolicyPageProps = {
  title: string;
  updated: string;
  updatedDateTime: string;
  pdfHref: string;
  children: ReactNode;
};

export function PolicyPage({ title, updated, updatedDateTime, pdfHref, children }: PolicyPageProps) {
  return (
    <main className={styles.main} id="main-content">
      <article className={styles.policy} aria-labelledby="policy-title">
        <header className={styles.header}>
          <h1 id="policy-title">{title}</h1>
          <div className={styles.details}>
            <p>Last updated: <time dateTime={updatedDateTime}>{updated}</time></p>
            <a className="button button-secondary button-small" href={pdfHref} download>Download PDF</a>
          </div>
        </header>
        <div className={styles.content}>{children}</div>
      </article>
    </main>
  );
}
