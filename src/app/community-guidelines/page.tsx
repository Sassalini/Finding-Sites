import type { Metadata } from "next";
import { PolicyPage } from "@/components/layout/PolicyPage";

export const metadata: Metadata = { title: "Community Guidelines" };

export default function CommunityGuidelinesPage() {
  return (
    <PolicyPage title="Community Guidelines" updated="23 August 2026" updatedDateTime="2026-08-23" pdfHref="/policies/community-guidelines.pdf">
      <p>FindingSites.com is a simple website directory. These Community Guidelines exist to keep the directory useful, safe and reasonably free from abuse.</p>
      <section aria-labelledby="submit-legitimate-websites">
        <h2 id="submit-legitimate-websites">1. Submit Legitimate Websites</h2>
        <p>Only submit websites and URLs that you are authorised to submit or have a legitimate reason to recommend.</p>
        <p>Do not submit URLs designed primarily to mislead visitors about who operates the website.</p>
      </section>
      <section aria-labelledby="no-malicious-websites">
        <h2 id="no-malicious-websites">2. No Malicious Websites</h2>
        <p>FindingSites does not permit listings that primarily facilitate:</p>
        <ul>
          <li>Malware.</li>
          <li>Phishing.</li>
          <li>Credential theft.</li>
          <li>Hacking or unauthorised access.</li>
          <li>Fraud.</li>
          <li>Scams.</li>
          <li>Distribution of malicious software.</li>
          <li>Other unlawful or harmful activity.</li>
        </ul>
      </section>
      <section aria-labelledby="no-deliberate-deception">
        <h2 id="no-deliberate-deception">3. No Deliberate Deception</h2>
        <p>Do not use FindingSites to deliberately misrepresent a business, organisation, product, service or person.</p>
        <p>Listings should not be created primarily to impersonate another organisation or deceive visitors.</p>
      </section>
      <section aria-labelledby="no-abuse-of-the-directory">
        <h2 id="no-abuse-of-the-directory">4. No Abuse of the Directory</h2>
        <p>Do not attempt to manipulate, damage or disrupt FindingSites.</p>
        <p>This includes excessive automated requests, attacks against the website, attempts to bypass technical restrictions and other behaviour intended to interfere with the service.</p>
      </section>
      <section aria-labelledby="keep-submissions-relevant">
        <h2 id="keep-submissions-relevant">5. Keep Submissions Relevant</h2>
        <p>FindingSites is intended to catalogue websites.</p>
        <p>Submissions should therefore point to an actual website or meaningful online destination rather than pages created solely for spam, automated content or abuse of the directory.</p>
      </section>
      <section aria-labelledby="removal-requests">
        <h2 id="removal-requests">6. Removal Requests</h2>
        <p>FindingSites may independently discover and list websites.</p>
        <p>If you own or operate a website that has been listed and you want it removed, email:</p>
        <p><a href="mailto:CentrumDisce@gmail.com">CentrumDisce@gmail.com</a></p>
        <p>Please include the URL that you want removed.</p>
        <p>We may request reasonable information to confirm that the request is genuine.</p>
      </section>
      <section aria-labelledby="enforcement">
        <h2 id="enforcement">7. Enforcement</h2>
        <p>FindingSites may reject, edit, suspend or remove listings that violate these guidelines.</p>
        <p>Depending on the circumstances, we may take action without prior notice.</p>
        <p>We may also remove listings that are not technically in violation of a specific guideline where we reasonably believe removal is necessary to protect users, the directory or the operation of the website.</p>
      </section>
      <section aria-labelledby="reporting-problems">
        <h2 id="reporting-problems">8. Reporting Problems</h2>
        <p>To report a malicious, fraudulent, illegal or otherwise inappropriate listing, email:</p>
        <p><a href="mailto:CentrumDisce@gmail.com">CentrumDisce@gmail.com</a></p>
        <p>Please provide the URL and a brief explanation of the issue.</p>
      </section>
      <section aria-labelledby="updates">
        <h2 id="updates">9. Updates</h2>
        <p>These guidelines may be updated as FindingSites develops.</p>
        <p>The latest version will be published on FindingSites.com.</p>
      </section>
    </PolicyPage>
  );
}
