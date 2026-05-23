import Link from "next/link";

const FOOTER_LINKS = [
  { href: "/grievance-redressal", label: "Grievance Redressal" },
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms-and-conditions", label: "Terms and Conditions" },
  { href: "/contact-us", label: "Contact Us" },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-[#d9e1ea] bg-white px-3 py-2 text-[#14243a]">
      <nav
        className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-center gap-x-5 gap-y-1 text-center text-xs font-bold uppercase tracking-[0.08em]"
        aria-label="Footer links"
      >
        {FOOTER_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="hover:text-[#c91522] hover:underline">
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
