import LegalPage from "@/components/legal-page";

export const metadata = {
  title: "Contact Us | GEN-H",
};

export default function ContactUsPage() {
  return (
    <LegalPage
      title="Contact Us"
      intro="We are here to support your journalistic and operational needs. Whether you have technical queries, require assistance with the GEN-H dashboard, or have general feedback, our team is ready to assist you."
      sections={[
        {
          heading: "Get In Touch",
          paragraphs: [
            "For any technical help or queries related to the platform, please contact us through the following channels:",
          ],
          items: [
            "General & Technical Support: guatamenterprises.projects@gmail.com",
            "Grievance Redressal: info@gautamenterprises.org",
          ],
        },
        {
          heading: "Operational Hours",
          paragraphs: ["We are ready to serve you at all times."],
        },
        {
          heading: "Our Mission",
          items: [
            "Fast: Real-time news feed.",
            "Accurate: Verified and fact-checked content.",
            "Impartial: Neutral and unbiased reporting.",
            "Global: News from across the world.",
          ],
        },
      ]}
    />
  );
}
