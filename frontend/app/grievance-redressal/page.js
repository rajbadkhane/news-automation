import LegalPage from "@/components/legal-page";

export const metadata = {
  title: "Grievance Redressal | GEN-H",
};

export default function GrievanceRedressalPage() {
  return (
    <LegalPage
      title="Grievance Redressal Mechanism"
      intro="In accordance with the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, GEN-H is committed to maintaining accountability and transparency. Any person aggrieved by the content published on this platform may file a formal complaint."
      sections={[
        {
          heading: "Contact Information",
          paragraphs: [
            "If you have concerns regarding our content, please direct your grievances to our designated officer:",
          ],
          items: [
            "Grievance Officer Name: Rajanchal Tripathi",
            "Designation: Grievance Redressal Officer",
            "Official Email: info@gautamenterprises.org",
          ],
        },
        {
          heading: "Our Commitment",
          paragraphs: [
            "We value the integrity of our reporting and the concerns of our readers. To ensure a timely and fair resolution process:",
          ],
          items: [
            "Acknowledgment: We will acknowledge the receipt of all complaints within 24 hours.",
            "Resolution: We are committed to resolving all grievances within 15 days of receiving the complaint.",
            "For general technical help, platform queries, or support regarding the GEN-H dashboard, you may also reach out to our team at guatamenterprises.projects@gmail.com.",
          ],
        },
      ]}
    />
  );
}
