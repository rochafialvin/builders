import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "../components/shell";
import { WaJoinLink } from "../components/wa-join-link";
import { shareCard, waAdminUrl, waCommunityUrl } from "../content";
import { currentLocale } from "../lib/locale-server";
import { tx } from "../lib/locale";
import { isOss, site } from "../lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale();
  const title = tx(locale, `Komunitas — ${site.name}`, `Community — ${site.name}`);
  const description = tx(
    locale,
    isOss
      ? "Grup WhatsApp komunitas swegrowth buat kontributor open source: share project, PR, dan yang sudah di-merge, tanya kalau mentok, dan info acara."
      : "Grup WhatsApp komunitas swegrowth buat yang lagi bangun produk: share progres, cari teman tim, tanya kalau mentok, dan info acara.",
    isOss
      ? "The swegrowth community's WhatsApp group for open source contributors: share projects, PRs and merges, ask when stuck, and hear about events."
      : "The swegrowth community's WhatsApp group for people building products: share progress, find teammates, ask when stuck, and hear about events.",
  );
  return {
    title,
    description,
    alternates: { canonical: "/community" },
    openGraph: shareCard({ title, description, url: "/community" }),
  };
}

/** What happens in the group: [tone, title id, title en, body id, body en]. */
const ACTIVITIES: [string, string, string, string, string][] = isOss
  ? [
      ["tone-account", "Share project OSS kita", "Share our OSS projects", "Lagi bikin atau maintain repo open source? Kenalin di grup, biar ada yang mampir dan ikut kontribusi.", "Building or maintaining an open source repo? Introduce it, so people drop by and contribute."],
      ["tone-pick", "Share PR kita", "Share our PRs", "Baru buka PR? Taruh link-nya. Siapa tahu ada yang bisa bantu review atau kasih masukan.", "Just opened a PR? Post the link. Somebody may help review it or have a suggestion."],
      ["tone-done", "Share PR yang di-merge", "Share merged PRs", "PR-mu masuk? Rayain bareng. Kontribusi yang kelihatan bikin yang lain ikut semangat.", "Your PR got merged? Celebrate it here. Visible contributions get others going too."],
      ["tone-wa", "Share info", "Share what you find", "Repo yang lagi cari kontributor, event, lowongan, atau bacaan yang berguna buat teman-teman.", "Repos looking for contributors, events, openings, or reading worth passing on."],
      ["tone-work", "Tanya", "Ask", "Mentok setup, bingung alur kontribusi, atau nggak tahu mulai dari mana—tanya aja.", "Stuck on setup, unsure how a project takes contributions, or where to start—just ask."],
    ]
  : [
      ["tone-account", "Share produk kita", "Share our products", "Lagi bangun produk? Kenalin di grup, biar ada yang coba, kasih masukan, atau ikut bantu.", "Building a product? Introduce it, so people try it, give feedback, or pitch in."],
      ["tone-pick", "Share progres dan rilis", "Share progress and launches", "Fitur baru, rilis, user pertama—ceritain. Progres yang kelihatan bikin yang lain ikut semangat.", "A new feature, a launch, a first user—tell us. Visible progress gets others going too."],
      ["tone-done", "Cari teman tim", "Find teammates", "Butuh desainer, QA, atau partner ngoding? Tanya di grup, atau tawarin bantuanmu.", "Need a designer, QA, or a coding partner? Ask here, or offer your help."],
      ["tone-wa", "Share info", "Share what you find", "Event, lowongan, tools, atau bacaan yang berguna buat teman-teman.", "Events, openings, tools, or reading worth passing on."],
      ["tone-work", "Tanya", "Ask", "Mentok teknis, bingung soal produk, atau nggak tahu mulai dari mana—tanya aja.", "Stuck on something technical, unsure about a product decision, or where to start—just ask."],
    ];

/** The group's rules: [title id, title en, body id, body en]. Being active is asked for, not enforced. */
const RULES: [string, string, string, string][] = [
  ["Ayo aktif", "Join in", "Grup ini hidup dari yang dibagikan anggotanya. Sesekali share sesuatu—project, PR, progres, info, atau pertanyaan—sekecil apa pun.", "The group lives on what its members share. Now and then, post something—a project, a PR, progress, a find, or a question—however small."],
  ["Saling bantu, tetap sopan", "Help out, stay kind", "Kritik karyanya, bukan orangnya.", "Critique the work, not the person."],
  ["Promosi secukupnya", "Promote with care", "Boleh untuk karya sendiri atau project anggota. Spam, jualan, dan link judi atau pinjol tidak boleh.", "Fine for your own work or a member's project. No spam, selling, or gambling and loan links."],
  ["Bertanya dengan konteks", "Ask with context", "Ceritakan apa yang sudah dicoba dan error-nya apa, biar gampang dibantu.", "Say what you tried and what the error was, so it is easy to help."],
  ["Jaga privasi", "Keep it private", "Jangan bagikan data pribadi orang lain atau isi chat ke luar grup tanpa izin.", "Do not share other people's personal data, or the chat, outside the group without asking."],
];

/**
 * The community behind the site: what its WhatsApp group is for, and the few
 * rules it keeps.
 *
 * Open to everyone, the group link included — anyone may join, and this page
 * is where they read what the group expects first. Sessions and events are
 * announced in the group rather than promised here.
 */
export default async function CommunityPage() {
  const locale = await currentLocale();

  return (
    <>
      <SiteHeader returnTo="/community" active="community" />

      <main id="main-content" className="ab-page">
        <header className="ab-intro" aria-labelledby="community-title">
          <h1 id="community-title">{tx(locale, "Komunitasnya ada di WhatsApp.", "The community lives on WhatsApp.")}</h1>
          <div className="ab-story">
            <p>
              {isOss
                ? tx(
                    locale,
                    `Di balik ${site.name} ada komunitas swegrowth: orang-orang yang kontribusi ke open source, bareng-bareng. Obrolannya ada di grup WhatsApp—tempat share project dan PR, rayain yang di-merge, dan tanya kalau mentok.`,
                    `Behind ${site.name} is the swegrowth community: people contributing to open source, together. The talking happens in a WhatsApp group—where projects and PRs get shared, merges get celebrated, and anyone stuck can ask.`,
                  )
                : tx(
                    locale,
                    `Di balik ${site.name} ada komunitas swegrowth: orang-orang yang lagi bangun produk, bareng-bareng. Obrolannya ada di grup WhatsApp—tempat share progres, cari teman tim, dan tanya kalau mentok.`,
                    `Behind ${site.name} is the swegrowth community: people building products, together. The talking happens in a WhatsApp group—where progress gets shared, teammates get found, and anyone stuck can ask.`,
                  )}
            </p>
          </div>
        </header>

        {/* The way in, first: what the group is for and its rules follow. */}
        <section className="ab-cta ab-cta-top tone-wa" aria-labelledby="community-cta-title">
          <h2 id="community-cta-title">{tx(locale, "Masuk aja dulu.", "Come on in.")}</h2>
          <p>
            {tx(
              locale,
              "Gratis, terbuka buat siapa saja, dan nggak perlu akun di situs ini. Kenalin diri dan ceritain lagi ngerjain apa.",
              "Free, open to anyone, and no account here needed. Say hello and tell us what you are working on.",
            )}
          </p>
          <div className="ab-cta-actions">
            {waCommunityUrl ? (
              <WaJoinLink className="ab-button ab-button-primary" href={waCommunityUrl}>
                {tx(locale, "Gabung grup WhatsApp", "Join the WhatsApp group")} <span aria-hidden="true">↗</span>
              </WaJoinLink>
            ) : null}
            <a
              className="ab-button"
              href={waAdminUrl(`Halo Admin SWE Growth, saya mau tanya soal komunitas ${site.name}.`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {tx(locale, "Tanya admin dulu", "Ask the admin first")}
            </a>
          </div>
        </section>

        <section className="ab-section" aria-labelledby="activities-title">
          <h2 id="activities-title">{tx(locale, "Di grup ngapain aja", "What happens in the group")}</h2>
          <ul className="ab-cards">
            {ACTIVITIES.map(([tone, titleId, titleEn, bodyId, bodyEn]) => (
              <li key={titleEn} className={`ab-card ${tone}`}>
                <h3>{tx(locale, titleId, titleEn)}</h3>
                <p>{tx(locale, bodyId, bodyEn)}</p>
              </li>
            ))}
          </ul>
          <p className="ab-lead">
            {tx(locale, "Sesi dan acara komunitas diumumkan di grup.", "Community sessions and events are announced in the group.")}
          </p>
        </section>

        <section className="ab-section" aria-labelledby="rules-title">
          <h2 id="rules-title">{tx(locale, "Aturan main", "House rules")}</h2>
          <ol className="ab-cards ab-cards-two">
            {RULES.map(([titleId, titleEn, bodyId, bodyEn]) => (
              <li key={titleEn} className="ab-card">
                <h3>{tx(locale, titleId, titleEn)}</h3>
                <p>{tx(locale, bodyId, bodyEn)}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
