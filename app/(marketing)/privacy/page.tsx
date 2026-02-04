import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | TravelScout",
  description: "Privacy Policy for TravelScout Ltd - How we collect, use, and protect your personal information.",
};

export default function PrivacyPolicy() {
  const currentDate = new Date().toLocaleDateString("en-NZ", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <section className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-[color:var(--muted)]">Last updated: {currentDate}</p>
      </div>

      <div className="space-y-8 text-[color:var(--text)]">
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">1. Introduction</h2>
          <p>
            Travelscout Ltd ("we", "us", or "our") is committed to protecting your privacy and complying with the Privacy Act 2020 (New Zealand). This Privacy Policy explains how we collect, use, store, and protect your personal information when you use our website and services.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">2. Information We Collect</h2>
          <p>
            When you create an account or use our services, we may collect the following personal information:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Name</li>
            <li>Email address</li>
            <li>Any other information you voluntarily provide through your account</li>
          </ul>
          <p>
            We only collect personal information that is reasonably necessary to operate and improve our services.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">3. How We Use Your Information</h2>
          <p>We use your personal information to:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Create and manage user accounts</li>
            <li>Authenticate users and provide secure access to our platform</li>
            <li>Communicate with you about your account, including service-related and security messages</li>
            <li>Provide customer support and respond to enquiries</li>
            <li>Improve our services and user experience</li>
            <li>Comply with legal and regulatory obligations</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">4. Data Storage and Security</h2>
          <p>
            Your personal information is stored using secure, industry-standard infrastructure and managed using appropriate technical and organisational safeguards.
          </p>
          <p>These safeguards include, where appropriate:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Encrypted data storage and transmission</li>
            <li>Secure authentication and access controls</li>
            <li>Restricted access to personal information</li>
            <li>Regular monitoring and maintenance of systems</li>
          </ul>
          <p>
            Some data may be stored or processed outside New Zealand. Where this occurs, we take reasonable steps to ensure that overseas service providers protect your information in a manner consistent with New Zealand privacy law.
          </p>
          <p>
            While we take security seriously, no online system can be guaranteed to be completely secure.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">5. Disclosure of Personal Information</h2>
          <p>We do not sell or trade your personal information.</p>
          <p>We may disclose your personal information to:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Trusted service providers who help operate and support our services</li>
            <li>Regulatory authorities or law enforcement where required by law</li>
          </ul>
          <p>
            All service providers are required to use your information only for authorised purposes and to keep it secure.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">6. Access and Correction</h2>
          <p>Under the Privacy Act 2020, you have the right to:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Request access to the personal information we hold about you</li>
            <li>Request correction of any inaccurate or outdated information</li>
          </ul>
          <p>
            Requests can be made by contacting us using the details below. We will respond within a reasonable timeframe.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">7. Account Communications</h2>
          <p>
            We may send emails that are necessary for operating your account, such as verification messages, password resets, security alerts, and important service updates. These communications cannot be opted out of while your account remains active.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">8. Cookies</h2>
          <p>
            Our website may use cookies or similar technologies to support essential functionality and improve performance. These do not collect personal information unless you are logged in.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">9. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated revision date.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">10. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy or wish to exercise your privacy rights, please contact:
          </p>
          <div className="ml-4 space-y-1">
            <p className="font-semibold">Travelscout Ltd</p>
            <p>
              Email: <a href="mailto:info@travelscout.co.nz" className="link">info@travelscout.co.nz</a>
            </p>
          </div>
        </section>
      </div>
    </section>
  );
}
