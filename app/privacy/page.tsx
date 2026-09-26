export const metadata = {
  title: "Privacy Policy | RainShift",
  description: "RainShift Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <main
      style={{
        maxWidth: 860,
        margin: "0 auto",
        padding: "48px 24px 80px",
        fontFamily: "Arial, sans-serif",
        color: "#13243a",
        lineHeight: 1.65,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, color: "#3167d8" }}>
        RAINSHIFT
      </div>
      <h1>Privacy Policy</h1>
      <p><strong>Last updated: September 26, 2026</strong></p>

      <h2>1. Information we collect</h2>
      <p>
        RainShift may collect account information, business and scheduling data,
        customer information entered by your organization, integration metadata,
        billing information handled by payment providers, and technical
        information needed to operate and secure the service.
      </p>

      <h2>2. How we use information</h2>
      <p>
        We use information to provide RainShift, authenticate users, process
        subscriptions, connect authorized third-party integrations, generate
        weather and scheduling recommendations, maintain security, troubleshoot
        issues, and improve the service.
      </p>

      <h2>3. Third-party services</h2>
      <p>
        RainShift may send data to third-party providers when you authorize an
        integration or when a provider is required to deliver a feature. These
        may include scheduling, payment, weather, mapping, messaging, hosting,
        and analytics services.
      </p>

      <h2>4. Connected scheduling data</h2>
      <p>
        When you connect a scheduling platform, RainShift accesses the information
        necessary to identify relevant appointments, crews, customers, and
        schedule constraints. Integration credentials are stored using
        server-side protections and are used to maintain the connection and
        provide the requested functionality.
      </p>

      <h2>5. Payments</h2>
      <p>
        Payment card and PayPal account information is handled by the applicable
        payment provider. RainShift stores subscription identifiers and billing
        status needed to manage your account; RainShift does not require storage
        of your full payment credentials.
      </p>

      <h2>6. Data retention and deletion</h2>
      <p>
        We retain account and business data for as long as needed to provide the
        service and satisfy legitimate operational or legal requirements. You may
        request deletion of your account and associated data through the support
        method provided in RainShift.
      </p>

      <h2>7. Security</h2>
      <p>
        We use reasonable technical and organizational safeguards designed to
        protect information against unauthorized access, alteration, disclosure,
        or destruction. No internet service can guarantee absolute security.
      </p>

      <h2>8. Children's privacy</h2>
      <p>
        RainShift is a business service and is not intended for children.
      </p>

      <h2>9. Policy changes</h2>
      <p>
        We may update this Privacy Policy as the service changes. The updated
        policy will be posted at this URL with a revised effective date.
      </p>

      <h2>10. Contact</h2>
      <p>
        For privacy questions or data requests, use the support/contact method
        provided in your RainShift account or on the RainShift website.
      </p>
    </main>
  );
}
