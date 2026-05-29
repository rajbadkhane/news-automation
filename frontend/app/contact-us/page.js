import Link from "next/link";

const siteUrl = "https://news.gautamenterprises.org";
const founderName = "Rajanchal Tripathi";
const founderPhone = "8770967136";

export const metadata = {
  title: "Contact GEN-H Founder Rajanchal Tripathi",
  description:
    "Contact GEN-H News Agency by Gautam Enterprises. Founder Rajanchal Tripathi can be reached at 8770967136 for newsroom, platform and agency queries.",
  alternates: {
    canonical: "/contact-us",
  },
  keywords: [
    "Rajanchal Tripathi",
    "Rajanchal Tripathi founder",
    "GEN-H founder",
    "Gautam Enterprises founder",
    "Gautam Enterprises contact",
    "GEN-H contact",
    "news agency contact",
  ],
  openGraph: {
    title: "Contact GEN-H Founder Rajanchal Tripathi",
    description:
      "GEN-H News Agency by Gautam Enterprises is founded by Rajanchal Tripathi. Contact the team for newsroom and platform support.",
    url: "/contact-us",
    type: "website",
  },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "NewsMediaOrganization",
  name: "GEN-H News Agency",
  alternateName: ["Gautam Enterprises", "Gautam Tech Studio Newsroom", "GEN-H"],
  url: siteUrl,
  logo: `${siteUrl}/images/logo.png`,
  founder: {
    "@type": "Person",
    name: founderName,
    telephone: `+91${founderPhone}`,
    jobTitle: "Founder",
    worksFor: {
      "@type": "NewsMediaOrganization",
      name: "GEN-H News Agency",
    },
  },
  contactPoint: [
    {
      "@type": "ContactPoint",
      telephone: `+91${founderPhone}`,
      contactType: "founder office",
      areaServed: "IN",
      availableLanguage: ["Hindi", "English"],
    },
    {
      "@type": "ContactPoint",
      email: "guatamenterprises.projects@gmail.com",
      contactType: "technical support",
      areaServed: "IN",
      availableLanguage: ["Hindi", "English"],
    },
  ],
  sameAs: [siteUrl],
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "GEN-H News Agency",
      item: siteUrl,
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Contact Us",
      item: `${siteUrl}/contact-us`,
    },
  ],
};

const sections = [
  {
    heading: "Get In Touch",
    paragraphs: [
      "For technical help, newsroom access, platform support or general agency queries, please contact us through the following channels:",
    ],
    items: [
      "General & Technical Support: guatamenterprises.projects@gmail.com",
      "Grievance Redressal: info@gautamenterprises.org",
      `Founder Contact: ${founderPhone}`,
    ],
  },
  {
    heading: "Operational Hours",
    paragraphs: ["We are ready to serve newsrooms, media teams and partner organizations at all times."],
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
];

export default function ContactUsPage() {
  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 text-[#14243a]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([organizationSchema, breadcrumbSchema]),
        }}
      />
      <article className="mx-auto max-w-4xl rounded-lg border border-[#d8e0e8] bg-white p-5 shadow-sm sm:p-8">
        <Link href="/news-table" className="text-xs font-black uppercase tracking-[0.14em] text-[#c91522] hover:underline">
          Back to News Table
        </Link>

        <section className="mt-5 border-l-4 border-[#c91522] bg-[#f9fbff] p-4 sm:p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#c91522]">Founder</p>
          <h1 className="mt-2 text-3xl font-black leading-tight text-[#0f2138] sm:text-4xl">
            Rajanchal Tripathi
          </h1>
          <p className="mt-3 text-sm leading-7 text-[#334155]">
            Rajanchal Tripathi is the founder of GEN-H News Agency by Gautam Enterprises, a newsroom platform built for fast, accurate, impartial and global news delivery.
          </p>
          <a
            href={`tel:+91${founderPhone}`}
            className="mt-4 inline-flex items-center border border-[#c91522] px-4 py-2 text-sm font-black text-[#c91522] hover:bg-[#c91522] hover:text-white"
          >
            Call Founder: {founderPhone}
          </a>
        </section>

        <h2 className="mt-7 text-2xl font-black leading-tight text-[#0f2138] sm:text-3xl">Contact Us</h2>
        <p className="mt-4 text-base leading-7 text-[#334155]">
          We are here to support your journalistic and operational needs. Whether you have technical queries, require assistance with the GEN-H dashboard, or have general feedback, our team is ready to assist you.
        </p>

        <div className="mt-7 space-y-7">
          {sections.map((section) => (
            <section key={section.heading}>
              <h3 className="text-lg font-black text-[#123b61]">{section.heading}</h3>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mt-3 text-sm leading-7 text-[#334155]">
                  {paragraph}
                </p>
              ))}
              {section.items?.length ? (
                <ul className="mt-3 space-y-2 text-sm leading-7 text-[#334155]">
                  {section.items.map((item) => (
                    <li key={item} className="border-l-2 border-[#c91522] pl-3">
                      {item}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
