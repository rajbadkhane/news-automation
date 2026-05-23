import LegalPage from "@/components/legal-page";

export const metadata = {
  title: "Privacy Policy | GEN-H",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="At GEN-H, we are committed to protecting the privacy and security of our users. This policy outlines how we handle information in connection with our news platform."
      sections={[
        {
          heading: "1. Data Collection and Usage",
          items: [
            "We operate as a wired news agency, providing real-time, verified, and fact-checked news.",
            "We process data to ensure fast and accurate news delivery.",
            "Our platform facilitates news management through a dashboard, allowing users to view, download, and copy content.",
            "We maintain an impartial, neutral, and unbiased stance in our reporting.",
          ],
        },
        {
          heading: "2. User Security",
          items: [
            "Security is a priority for our registered users.",
            "We provide a Secure Logout feature to ensure that your account remains protected after every session.",
            "We advise all users to always logout after use to maintain account security.",
          ],
        },
        {
          heading: "3. Best Practices for Content",
          paragraphs: [
            "To uphold the integrity of our news agency, we adhere to the following ethical guidelines:",
          ],
          items: [
            "Users must always verify news content before publishing or broadcasting.",
            "Content must be used in accordance with the specific policies of your channel or platform.",
            "We require that users provide proper credit when utilizing our news content.",
            "Editing of headlines without prior permission is strictly discouraged.",
            "All users are expected to maintain neutrality and follow ethical journalism standards.",
          ],
        },
        {
          heading: "4. Contact Us",
          paragraphs: [
            "For any technical help or inquiries regarding platform usage or privacy, you may contact us at:",
          ],
          items: [
            "Email: guatamenterprises.projects@gmail.com",
            "Note: This privacy policy is designed for internal operations and platform usage. You may wish to consult with a legal professional to ensure this meets all specific regulatory requirements for digital news media in your jurisdiction.",
          ],
        },
      ]}
    />
  );
}
