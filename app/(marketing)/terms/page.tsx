import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | TravelScout",
  description: "Terms of Service for TravelScout Ltd - The terms and conditions for using our website and services.",
};

export default function TermsOfService() {
  const currentDate = new Date().toLocaleDateString("en-NZ", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <section className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
        <p className="text-[color:var(--muted)]">Last updated: {currentDate}</p>
      </div>

      <div className="space-y-8 text-[color:var(--text)]">
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">1. Acceptance of Terms</h2>
          <p>
            By accessing or using the Travelscout Ltd website and services ("Services"), you agree to be bound by these Terms of Service. If you do not agree, you must not use our Services.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">2. Accounts</h2>
          <p>To access certain features, you must create an account. You agree to:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Provide accurate and up-to-date information</li>
            <li>Keep your login credentials secure</li>
            <li>Notify us immediately of any unauthorised use of your account</li>
          </ul>
          <p>You are responsible for all activity that occurs under your account.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">3. Use of the Services</h2>
          <p>You agree not to:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Use the Services for unlawful purposes</li>
            <li>Attempt to gain unauthorised access to our systems</li>
            <li>Interfere with or disrupt the operation of the Services</li>
            <li>Misuse, copy, or exploit the Services or content without permission</li>
          </ul>
          <p>We reserve the right to suspend or terminate accounts that violate these Terms.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">4. Intellectual Property</h2>
          <p>
            All content, features, and functionality on the Services are owned by Travelscout Ltd or its licensors and are protected by intellectual property laws. You may not reproduce, distribute, or modify any part of the Services without our prior written consent.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">5. Availability of Services</h2>
          <p>
            We aim to provide reliable access to the Services but do not guarantee uninterrupted availability. We may modify, suspend, or discontinue any part of the Services at any time.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">6. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Travelscout Ltd will not be liable for any indirect, incidental, or consequential loss arising from your use of the Services.
          </p>
          <p>
            Nothing in these Terms limits rights or remedies that cannot be excluded under New Zealand law.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">7. Termination</h2>
          <p>
            You may stop using the Services at any time. We may suspend or terminate your access if you breach these Terms or if required for legal or security reasons.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">8. Governing Law</h2>
          <p>
            These Terms are governed by the laws of New Zealand, and any disputes will be subject to the exclusive jurisdiction of New Zealand courts.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">9. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. Continued use of the Services after changes are posted constitutes acceptance of the updated Terms.
          </p>
        </section>
      </div>
    </section>
  );
}
