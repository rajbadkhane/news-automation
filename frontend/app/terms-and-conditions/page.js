import LegalPage from "@/components/legal-page";

export const metadata = {
  title: "Terms and Conditions | GEN-H",
};

export default function TermsAndConditionsPage() {
  return (
    <LegalPage
      title="Terms and Conditions"
      intro="Welcome to GEN-H. By accessing or using our platform and services, you agree to be bound by these Terms and Conditions. Please read them carefully."
      sections={[
        {
          heading: "1. Acceptance of Terms",
          paragraphs: [
            "By accessing our website or using our news services, you affirm that you have read, understood, and agreed to be legally bound by these terms. If you do not agree, you are not authorized to use our services.",
          ],
        },
        {
          heading: "2. User Eligibility",
          paragraphs: [
            "You represent and warrant that you possess the legal authority to enter into this agreement under applicable law. Users must be at least 18 years of age or have obtained parental consent where applicable.",
          ],
        },
        {
          heading: "3. Intellectual Property Rights",
          items: [
            "All content provided on this platform, including articles, headlines, images, and software, is the intellectual property of Gautam Enterprises and/or its licensors.",
            "You are granted a limited, non-exclusive, non-transferable license to access our content for personal, informational use.",
            "You must not republish, sell, rent, sub-license, or reproduce our content without prior authorization.",
          ],
        },
        {
          heading: "4. Acceptable Use and Prohibited Activities",
          paragraphs: ["Users must not use our platform to:"],
          items: [
            "Host, display, upload, or publish any content that is defamatory, obscene, invasive of privacy, or otherwise unlawful.",
            "Attempt to reverse-engineer, decompile, or disassemble our platform or software.",
            "Engage in activities that interfere with the security or integrity of our computer resources.",
          ],
        },
        {
          heading: "5. Disclaimer of Liability",
          paragraphs: [
            "Our services are provided on an as is and as available basis. While we strive for accuracy, Gautam Enterprises disclaims all warranties regarding the completeness or reliability of the news content. We shall not be held liable for any damages or losses arising from the use of, or inability to use, our platform.",
          ],
        },
        {
          heading: "6. Termination",
          paragraphs: [
            "We reserve the right to suspend or terminate your access to our platform at our sole discretion, without prior notice, if you violate these terms or engage in any abusive conduct.",
          ],
        },
        {
          heading: "7. Changes to Terms",
          paragraphs: [
            "We may update these terms periodically. Your continued use of the platform after such updates constitutes your acceptance of the revised Terms and Conditions.",
          ],
        },
        {
          heading: "8. Governing Law",
          paragraphs: [
            "These terms are governed by the laws of India. Any disputes arising in connection with these terms shall be subject to the exclusive jurisdiction of the courts in Bhopal, Madhya Pradesh.",
          ],
        },
        {
          heading: "9. Contact Information",
          paragraphs: ["For any questions regarding these Terms and Conditions, please contact us at:"],
          items: ["Email: guatamenterprises.projects@gmail.com"],
        },
      ]}
    />
  );
}
