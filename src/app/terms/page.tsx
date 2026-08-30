import type { Metadata } from "next";
import { PolicyPage } from "@/components/layout/PolicyPage";

export const metadata: Metadata = { title: "Terms and Conditions" };

export default function TermsPage() {
  return (
    <PolicyPage title="Terms and Conditions" updated="23 August 2026" updatedDateTime="2026-08-23" pdfHref="/policies/terms.pdf">
      <p>These Terms and Conditions (&quot;Terms&quot;) govern your use of FindingSites.com (&quot;FindingSites&quot;, &quot;we&quot;, &quot;us&quot; or &quot;our&quot;).</p>
      <p>By using FindingSites.com, submitting a URL, creating an account or purchasing a subscription, you agree to these Terms.</p>
      <section aria-labelledby="about-findingsites-com">
        <h2 id="about-findingsites-com">1. About FindingSites.com</h2>
        <p>FindingSites.com is an online directory of websites and URLs.</p>
        <p>The directory may contain:</p>
        <ul>
          <li>URLs submitted by users.</li>
          <li>URLs independently discovered by FindingSites.</li>
          <li>Publicly available information relating to websites.</li>
        </ul>
        <p>A listing on FindingSites.com does not mean that FindingSites endorses, recommends, verifies or guarantees the website concerned.</p>
      </section>
      <section aria-labelledby="paid-listings">
        <h2 id="paid-listings">2. Paid Listings</h2>
        <p>FindingSites may offer paid directory listings for <strong>£2 per month</strong>.</p>
        <p>Unless otherwise stated at the time of purchase, the subscription:</p>
        <ul>
          <li>Is charged monthly.</li>
          <li>Renews automatically each month.</li>
          <li>Continues until cancelled.</li>
          <li>Provides the benefits associated with the relevant paid listing for as long as the subscription remains active and the listing complies with these Terms.</li>
        </ul>
        <p>The applicable price will be shown before you complete the purchase.</p>
      </section>
      <section aria-labelledby="payments">
        <h2 id="payments">3. Payments</h2>
        <p>Payments are processed through <strong>Stripe</strong>.</p>
        <p>By purchasing a subscription, you authorise the applicable recurring payment through <strong>Stripe</strong> until the subscription is cancelled.</p>
        <p>FindingSites does not ordinarily store complete payment card details.</p>
      </section>
      <section aria-labelledby="cancellation">
        <h2 id="cancellation">4. Cancellation</h2>
        <p>You may cancel your subscription at any time.</p>
        <p>Cancellation prevents future recurring charges. Unless applicable law requires otherwise, cancellation does not automatically provide a refund for a period that has already been paid for.</p>
        <p>Any cancellation process provided through the website or payment system should be used where available.</p>
        <p>Nothing in these Terms affects any statutory cancellation or refund rights you may have under applicable consumer law.</p>
      </section>
      <section aria-labelledby="refunds">
        <h2 id="refunds">5. Refunds</h2>
        <p>Except where required by law, subscription payments are non-refundable once a billing period has begun.</p>
        <p>Where a refund is legally required or where FindingSites chooses to provide one, the refund will generally be made through the original payment method.</p>
      </section>
      <section aria-labelledby="your-submitted-urls">
        <h2 id="your-submitted-urls">6. Your Submitted URLs</h2>
        <p>If you submit a URL to FindingSites.com, you confirm that:</p>
        <ul>
          <li>You have the right or authority to submit the URL.</li>
          <li>The submission does not knowingly violate applicable law.</li>
          <li>The submission is not intended to facilitate fraud, phishing, malware distribution or other malicious activity.</li>
          <li>Information you provide to FindingSites is reasonably accurate.</li>
        </ul>
        <p>Submitting a URL does not guarantee that it will be accepted or remain listed indefinitely.</p>
      </section>
      <section aria-labelledby="listing-decisions">
        <h2 id="listing-decisions">7. Listing Decisions</h2>
        <p>FindingSites reserves the right to refuse, edit, suspend or remove a listing where we reasonably consider this necessary.</p>
        <p>Reasons may include:</p>
        <ul>
          <li>The website appears to be malicious or unsafe.</li>
          <li>The website appears to facilitate illegal activity.</li>
          <li>The listing violates these Terms or the Community Guidelines.</li>
          <li>The information appears deceptive or misleading.</li>
          <li>The website is unavailable or repeatedly inaccessible.</li>
          <li>The listing creates a legal, security or operational concern.</li>
          <li>We otherwise reasonably determine that removal is appropriate.</li>
        </ul>
        <p>We are not required to provide advance notice before removing a listing where immediate action is reasonably necessary.</p>
      </section>
      <section aria-labelledby="independently-discovered-urls">
        <h2 id="independently-discovered-urls">8. Independently Discovered URLs</h2>
        <p>FindingSites may occasionally list URLs that we discover independently.</p>
        <p>The owner or operator of an independently listed website does not need to become a customer to request removal.</p>
        <p>Removal requests can be sent to:</p>
        <p><a href="mailto:CentrumDisce@gmail.com">CentrumDisce@gmail.com</a></p>
        <p>We will consider reasonable removal requests and may request information sufficient to establish that the request is legitimate.</p>
      </section>
      <section aria-labelledby="third-party-websites">
        <h2 id="third-party-websites">9. Third-Party Websites</h2>
        <p>FindingSites is a directory and does not control third-party websites listed in the directory.</p>
        <p>We do not guarantee that any listed website:</p>
        <ul>
          <li>Is safe.</li>
          <li>Is accurate.</li>
          <li>Is lawful.</li>
          <li>Is available.</li>
          <li>Is free from malware.</li>
          <li>Will remain operational.</li>
          <li>Will provide any particular product or service.</li>
        </ul>
        <p>You visit third-party websites at your own risk.</p>
      </section>
      <section aria-labelledby="acceptable-use">
        <h2 id="acceptable-use">10. Acceptable Use</h2>
        <p>You must not use FindingSites.com to:</p>
        <ul>
          <li>Commit or facilitate unlawful activity.</li>
          <li>Distribute malware.</li>
          <li>Conduct phishing or credential theft.</li>
          <li>Submit fraudulent or deliberately deceptive information.</li>
          <li>Attempt to compromise, disrupt or damage FindingSites.com.</li>
          <li>Scrape or access the website in a manner that places unreasonable load on our systems.</li>
          <li>Circumvent security measures or access controls.</li>
          <li>Abuse the subscription or payment system.</li>
          <li>Submit URLs for the primary purpose of distributing malicious or harmful content.</li>
        </ul>
        <p>We may suspend or terminate access where we reasonably believe these Terms have been breached.</p>
      </section>
      <section aria-labelledby="availability">
        <h2 id="availability">11. Availability</h2>
        <p>We aim to keep FindingSites.com available, but we do not guarantee uninterrupted or error-free operation.</p>
        <p>The website may occasionally be unavailable because of maintenance, technical problems, hosting problems, security incidents or circumstances outside our reasonable control.</p>
      </section>
      <section aria-labelledby="intellectual-property">
        <h2 id="intellectual-property">12. Intellectual Property</h2>
        <p>Unless otherwise stated, the FindingSites.com website, branding, design, text and original directory content are owned by or licensed to FindingSites.</p>
        <p>You may access and use the directory for normal personal or business purposes in accordance with these Terms.</p>
        <p>You must not copy, reproduce, republish or commercially exploit substantial portions of the FindingSites directory without permission.</p>
      </section>
      <section aria-labelledby="liability">
        <h2 id="liability">13. Liability</h2>
        <p>Nothing in these Terms excludes or limits liability where doing so would be unlawful.</p>
        <p>Subject to that, FindingSites is not responsible for losses arising from:</p>
        <ul>
          <li>Third-party websites listed in the directory.</li>
          <li>Information supplied by third parties.</li>
          <li>Temporary website unavailability.</li>
          <li>Loss caused by malicious or unlawful activity conducted by third parties.</li>
          <li>Decisions made by you based on information contained in the directory.</li>
        </ul>
        <p>FindingSites is a directory service and should not be treated as a verification, certification or endorsement service.</p>
      </section>
      <section aria-labelledby="account-suspension-or-termination">
        <h2 id="account-suspension-or-termination">14. Account Suspension or Termination</h2>
        <p>We may suspend or terminate an account or listing if we reasonably believe that:</p>
        <ul>
          <li>These Terms have been breached.</li>
          <li>The account is being used fraudulently.</li>
          <li>The service is being abused.</li>
          <li>Continued access presents a security, legal or operational risk.</li>
        </ul>
        <p>Where appropriate, we may provide an explanation.</p>
        <p>Termination does not remove any rights or obligations that have accrued before termination.</p>
      </section>
      <section aria-labelledby="changes-to-findingsites">
        <h2 id="changes-to-findingsites">15. Changes to FindingSites</h2>
        <p>We may change, suspend or discontinue parts of FindingSites from time to time.</p>
        <p>We may also modify these Terms where reasonably necessary.</p>
        <p>The current version will be published on FindingSites.com.</p>
      </section>
      <section aria-labelledby="consumer-rights">
        <h2 id="consumer-rights">16. Consumer Rights</h2>
        <p>If you are a consumer, nothing in these Terms is intended to remove or restrict rights that cannot legally be excluded under applicable consumer protection law.</p>
      </section>
      <section aria-labelledby="governing-law">
        <h2 id="governing-law">17. Governing Law</h2>
        <p>These Terms are governed by the laws of <strong>England and Wales</strong>, unless applicable law requires otherwise.</p>
        <p>The courts of <strong>England and Wales</strong> will have jurisdiction, subject to any mandatory rights you may have under applicable consumer protection law.</p>
      </section>
      <section aria-labelledby="contact">
        <h2 id="contact">18. Contact</h2>
        <p>Questions concerning these Terms, subscriptions or URL listings can be sent to:</p>
        <p><a href="mailto:CentrumDisce@gmail.com">CentrumDisce@gmail.com</a></p>
      </section>
    </PolicyPage>
  );
}
