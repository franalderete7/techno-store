import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | TechnoStore",
  description: "TechnoStore privacy policy – how we collect, use, and protect your data.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl rounded-2xl border bg-card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: March 9, 2026
        </p>

        <section className="mt-8 space-y-6 text-sm leading-6 text-muted-foreground">
          <div>
            <h2 className="text-base font-medium text-foreground">
              1. Introduction
            </h2>
            <p className="mt-2">
              TechnoStore (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to protecting your
              privacy. This Privacy Policy explains how we collect, use, disclose,
              and safeguard your information when you use our services, including
              our web application and any related mobile applications.
            </p>
          </div>

          <div>
            <h2 className="text-base font-medium text-foreground">
              2. Information We Collect
            </h2>
            <p className="mt-2">
              We may collect information that you provide directly, such as:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 pl-2">
              <li>Name and contact information (email, phone number)</li>
              <li>Account credentials when you sign up or log in</li>
              <li>Transaction and purchase history</li>
              <li>Product reservations and inquiries</li>
              <li>Communications and support requests</li>
            </ul>
            <p className="mt-2">
              We may also automatically collect device information, IP address,
              and usage data when you access our services.
            </p>
          </div>

          <div>
            <h2 className="text-base font-medium text-foreground">
              3. How We Use Your Information
            </h2>
            <p className="mt-2">
              We use the information we collect to:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 pl-2">
              <li>Provide, maintain, and improve our services</li>
              <li>Process transactions and fulfill orders</li>
              <li>Send transactional communications and support</li>
              <li>Detect and prevent fraud or abuse</li>
              <li>Comply with legal obligations</li>
              <li>Analyze usage to improve user experience</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-medium text-foreground">
              4. Data Storage and Security
            </h2>
            <p className="mt-2">
              Your data is stored and processed using Supabase and may be hosted
              on infrastructure provided by third-party cloud providers. We
              implement appropriate technical and organizational measures to
              protect your personal information against unauthorized access,
              alteration, disclosure, or destruction.
            </p>
          </div>

          <div>
            <h2 className="text-base font-medium text-foreground">
              5. Third-Party Services
            </h2>
            <p className="mt-2">
              We may use third-party services for hosting, analytics, payment
              processing, and communication (e.g., WhatsApp, messaging
              platforms). These services have their own privacy policies. We
              encourage you to review them.
            </p>
          </div>

          <div>
            <h2 className="text-base font-medium text-foreground">
              6. Your Rights
            </h2>
            <p className="mt-2">
              Depending on your location, you may have the right to access,
              correct, delete, or restrict the processing of your personal data.
              You may also have the right to data portability and to withdraw
              consent. To exercise these rights, please contact us.
            </p>
          </div>

          <div>
            <h2 className="text-base font-medium text-foreground">
              7. Cookies and Similar Technologies
            </h2>
            <p className="mt-2">
              We may use cookies and similar technologies to maintain sessions,
              remember preferences, and analyze how our services are used. You
              can control cookie settings through your browser.
            </p>
          </div>

          <div>
            <h2 className="text-base font-medium text-foreground">
              8. Changes to This Policy
            </h2>
            <p className="mt-2">
              We may update this Privacy Policy from time to time. We will
              notify you of any material changes by posting the new policy on
              this page and updating the &quot;Last updated&quot; date.
            </p>
          </div>

          <div>
            <h2 className="text-base font-medium text-foreground">
              9. Contact Us
            </h2>
            <p className="mt-2">
              If you have questions about this Privacy Policy or our data
              practices, please contact us at the contact information provided
              in the TechnoStore application or through your usual business
              channel.
            </p>
          </div>
        </section>

        <p className="mt-10 text-xs text-muted-foreground">
          © {new Date().getFullYear()} TechnoStore. All rights reserved.
        </p>
      </div>
    </div>
  );
}
