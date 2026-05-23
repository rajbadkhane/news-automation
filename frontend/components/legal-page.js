import Link from "next/link";

export default function LegalPage({ title, intro, sections }) {
  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 text-[#14243a]">
      <article className="mx-auto max-w-4xl rounded-lg border border-[#d8e0e8] bg-white p-5 shadow-sm sm:p-8">
        <Link href="/news-table" className="text-xs font-black uppercase tracking-[0.14em] text-[#c91522] hover:underline">
          Back to News Table
        </Link>
        <h1 className="mt-4 text-3xl font-black leading-tight text-[#0f2138] sm:text-4xl">{title}</h1>
        {intro ? <p className="mt-4 text-base leading-7 text-[#334155]">{intro}</p> : null}

        <div className="mt-7 space-y-7">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-black text-[#123b61]">{section.heading}</h2>
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
