import type { Metadata } from "next";
import Link from "@/app/components/responsive-link";
import { SiteFooter, SiteHeader } from "../components/shell";
import { shareCard } from "../content";
import { currentLocale } from "../lib/locale-server";
import { tx } from "../lib/locale";
import { site } from "../lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale();
  const title = tx(locale, `Kebijakan Privasi — ${site.name}`, `Privacy Policy — ${site.name}`);
  const description = tx(locale, `Data yang dikumpulkan ${site.name}, informasi yang tampil secara publik, serta cara data digunakan dan dilindungi.`, `What ${site.name} collects, what's public, and how your data is used and protected.`);
  return {
    title,
    description,
    alternates: { canonical: "/privacy" },
    openGraph: shareCard({ title, description, url: "/privacy" }),
  };
}

export default async function PrivacyPage() {
  const locale = await currentLocale();

  return (
    <>
      <SiteHeader returnTo="/privacy" />

      <main id="main-content" className="page-narrow legal-content">
        <h1>{tx(locale, "Datamu, dan siapa yang dapat melihatnya.", "Your data, and who gets to see it.")}</h1>
        <p className="lede">
          {tx(locale, "Builders (builders.swegrowth.id) dan swegrowth OSS (oss.swegrowth.id) memakai akun dan data yang sama, jadi kebijakan ini berlaku untuk keduanya. Karena visibilitas karya merupakan inti layanan ini, kami menjelaskan secara langsung apa yang bersifat publik, apa yang tetap privat, dan ke mana datamu dikirim.", "Builders (builders.swegrowth.id) and swegrowth OSS (oss.swegrowth.id) share one account and one set of data, so this policy covers both. Because making work visible is central to the service, this page plainly explains what is public, what stays private, and where your data goes.")}
        </p>

        <h2>{tx(locale, "1. Data yang kami kumpulkan", "1. What we collect")}</h2>

        <h3>{tx(locale, "Akun", "Account")}</h3>
        <p>
          {tx(locale, "Kamu masuk dengan GitHub atau Google; akun lama yang dibuat dengan email dan kata sandi masih bisa masuk sampai ditautkan ke salah satunya. Autentikasi ditangani oleh Supabase Auth; aplikasi ini tidak menyimpan kata sandi dalam bentuk teks biasa. Saat menggunakan Google, kami hanya menerima nama, email, dan ID akun Google sesuai izin yang kamu berikan. Email akun digunakan untuk masuk dan pemberitahuan sistem, serta tidak ditampilkan secara publik kecuali kamu menambahkannya secara terpisah sebagai email publik. Saat menggunakan GitHub, kami hanya menerima nama, email, dan username GitHub-mu. Kalau kamu sendiri mencentang “Tampilkan aktivitas GitHub-ku” di profil, kami juga membaca pull request dan jumlah commit publikmu dari GitHub tiap 6 jam untuk halaman Aktivitas; hilangkan centangnya dan data itu langsung disembunyikan lalu dihapus.", "You sign in with GitHub or Google; older accounts made with an email and password can still sign in until they link one of those. Authentication is handled by Supabase Auth; this app never stores your password in plain text. When you use Google, we only receive your name, email, and Google account ID under the permissions you grant. Your account email is used for sign-in and system notices and is never public unless you separately add it as a public email. When you use GitHub, we only receive your name, email, and GitHub username. If you tick “Show my GitHub activity” on your profile yourself, we also read your public pull requests and commit counts from GitHub every 6 hours for the Activity page; untick it and that data is hidden at once, then deleted.")}
        </p>

        <h3>{tx(locale, "Profil (publik dan opsional)", "Profile (public and optional)")}</h3>
        <p>
          {tx(locale, "Selain nama, setiap kolom di", "Other than your name, every field on")} <Link href="/account/profile">/account/profile</Link>{" "}
          {tx(locale, "boleh diisi atau dilewati: akun GitHub, profesi, perkenalan singkat, bio, keahlian, serta tautan kontak. Kolom yang diisi akan muncul di profil publik.", "can be filled in or skipped: your GitHub account, profession, introduction, bio, skills, and contact links. Filled fields appear on your public profile.")}
        </p>

        <h3>{tx(locale, "Proyek dan kolaborasi", "Projects and collaboration")}</h3>
        <p>
          {tx(locale, "Tautan proyek, nama, deskripsi, ikon, ringkasan, masalah, solusi, sasaran, topik, tahap, pekerjaan terkini, perjalanan, peran terbuka, logo, komentar, dukungan, dan pengikut bersifat publik. Pengajuan peran serta tugas yang diambil dan diselesaikan juga dicatat agar kolaborasi dapat berlangsung. Jangan memasukkan informasi yang tidak ingin kamu tampilkan kepada publik.", "Project links, names, descriptions, icons, highlights, problems, solutions, audiences, topics, stages, current work, journeys, open roles, logos, comments, boosts, and follows are public. Role applications and tasks taken or completed are also recorded so collaboration can work. Do not enter anything you would not want to be public.")}
        </p>

        <h3>{tx(locale, "Jejak aktivitas", "Activity trail")}</h3>
        <p>
          {tx(locale, "Peristiwa tertentu dicatat otomatis saat terjadi—misalnya proyek dibuat, tahap berubah, peran dibuka atau diisi, tugas selesai, komentar dibuat, dukungan diberikan, atau kabar terbaru dikirim. Kamu dapat menyembunyikan jenis aktivitas tertentu dari profil publik; menyembunyikannya tidak menghapus catatan.", "Certain events are recorded automatically as they happen—for example, a project created, a stage changed, a role opened or filled, a task completed, a comment posted, a boost given, or an update posted. You can hide specific activity kinds from your public profile; hiding them does not delete the record.")}
        </p>

        <h3>{tx(locale, "Kotak masuk dan impor GitHub", "Inbox and GitHub import")}</h3>
        <p>
          {tx(locale, "Keputusan atas pengajuan dikirim sebagai pemberitahuan privat ke", "Application decisions are sent as private notices to")} <Link href="/inbox">/inbox</Link>.{" "}
          {tx(locale, "Saat kamu mengimpor repositori publik, kami membaca metadata dan README publik dari GitHub untuk mengisi formulir. Tidak ada data privat yang diakses dan hasilnya tidak disimpan sebelum kamu menyimpan proyek.", "When you import a public repository, we read its public metadata and README from GitHub to prefill the form. No private data is accessed, and the result is not stored until you save the project.")}
        </p>

        <h3>{tx(locale, "Masukan", "Feedback")}</h3>
        <p>
          {tx(locale, "Masukan yang dikirim lewat", "Feedback sent through")} <Link href="/feedback">/feedback</Link>{" "}
          {tx(locale, "tidak disimpan oleh situs ini. Form-nya hanya menyusun issue di GitHub dari isianmu dan membukanya di tab baru; tidak ada yang terkirim sampai kamu menekan Submit di GitHub dengan akunmu sendiri. Issue itu publik dan diatur oleh kebijakan privasi GitHub.", "is not stored by this site. The form only drafts a GitHub issue from what you typed and opens it in a new tab; nothing is sent until you press Submit on GitHub with your own account. That issue is public and governed by GitHub's privacy policy.")}
        </p>

        <h3>{tx(locale, "Data teknis", "Technical data")}</h3>
        <p>
          {tx(locale, "Sesi disimpan melalui cookie yang dikelola Supabase Auth, ditambah cookie PKCE berumur pendek saat masuk dengan Google. Situs ini juga menyimpan pilihan bahasa ID/EN. Kami tidak menggunakan cookie iklan atau analitik pihak ketiga.", "Your session is stored through cookies managed by Supabase Auth, plus a short-lived PKCE cookie during Google sign-in. This site also stores your ID/EN language choice. We do not use advertising or third-party analytics cookies.")}
        </p>

        <h2>{tx(locale, "2. Informasi publik dan privat", "2. Public and private information")}</h2>
        <ul>
          <li><strong>{tx(locale, "Selalu publik:", "Always public:")}</strong> {tx(locale, "proyek dan isinya, kolom profil yang kamu isi, jejak aktivitas selain jenis yang kamu sembunyikan, komentar, dan pengikut.", "projects and their content, profile fields you fill in, your activity trail except kinds you hide, comments, and follows.")}</li>
          <li><strong>{tx(locale, "Selalu privat:", "Always private:")}</strong> {tx(locale, "email akun (kecuali ditambahkan sebagai email publik), kata sandi, isi kotak masuk, dan isi proposal sebelum keputusan dibuat.", "your account email unless added as a public email, your password, inbox contents, and proposal contents before a decision is made.")}</li>
        </ul>

        <h2>{tx(locale, "3. Penggunaan data", "3. How data is used")}</h2>
        <p>
          {tx(locale, "Data digunakan untuk menjalankan fitur yang kamu lihat: menampilkan proyek dan profil, mempertemukan orang dengan peran, mengirim pemberitahuan pengajuan, serta membangun jejak aktivitas. Data tidak dijual dan tidak digunakan untuk iklan bertarget.", "Data is used to run the features you see: showing projects and profiles, matching people to roles, sending application notices, and building activity trails. It is not sold or used for targeted advertising.")}
        </p>

        <h2>{tx(locale, "4. Penyedia layanan", "4. Service providers")}</h2>
        <p>{tx(locale, "Data hanya dibagikan dengan penyedia yang menjalankan situs ini:", "Data is only shared with providers that run this site:")}</p>
        <ul>
          <li><strong>Supabase</strong> — {tx(locale, "basis data dan autentikasi, termasuk penyimpanan kata sandi dan sesi.", "database and authentication, including password storage and sessions.")}</li>
          <li><strong>Google</strong> — {tx(locale, "hanya jika kamu memilih masuk dengan akun Google.", "only if you choose to sign in with a Google account.")}</li>
          <li><strong>Netlify</strong> — {tx(locale, "hosting aplikasi.", "application hosting.")}</li>
          <li><strong>GitHub API</strong> — {tx(locale, "hanya saat kamu menggunakan fitur impor repositori publik.", "only when you use the public repository import feature.")}</li>
        </ul>

        <h2>{tx(locale, "5. Keamanan", "5. Security")}</h2>
        <p>
          {tx(locale, "Akses data dibatasi langsung di basis data melalui row level security Postgres. Tindakan sensitif, seperti memutuskan pengajuan atau memindahkan tugas, dijalankan melalui fungsi basis data yang dibatasi.", "Data access is restricted directly in the database through Postgres row level security. Sensitive actions, such as deciding an application or moving a task, run through restricted database functions.")}
        </p>

        <h2>{tx(locale, "6. Kendali yang kamu miliki", "6. Your controls")}</h2>
        <p>
          {tx(locale, "Kamu dapat mengedit atau mengosongkan kolom profil, menyembunyikan jenis aktivitas tertentu, menghapus proyek milikmu, dan keluar dari akun. Penghapusan akun belum tersedia secara mandiri; untuk meminta penghapusan atau menanyakan data, kirim email ke zikrulihsanmd@gmail.com.", "You can edit or clear profile fields, hide specific activity kinds, delete projects you own, and sign out. Account deletion is not yet self-service; to request deletion or ask about your data, email zikrulihsanmd@gmail.com.")}
        </p>

        <h2>{tx(locale, "7. Anak-anak", "7. Children")}</h2>
        <p>{tx(locale, "Situs ini tidak ditujukan untuk anak di bawah 13 tahun dan kami tidak dengan sengaja mengumpulkan data mereka.", "This site is not directed at children under 13, and we do not knowingly collect their data.")}</p>

        <h2>{tx(locale, "8. Perubahan kebijakan", "8. Changes to this policy")}</h2>
        <p>{tx(locale, `${site.name} masih aktif dikembangkan, sehingga kebijakan ini dapat berubah mengikuti fitur. Tanggal di bawah menunjukkan versi terbaru.`, `${site.name} is under active development, so this policy may change with its features. The date below reflects the latest version.`)}</p>

        <p className="muted" style={{ marginTop: 40 }}>
          {tx(locale, "Terakhir diperbarui: 29 Agustus 2026.", "Last updated: August 29, 2026.")}
        </p>
      </main>

      <SiteFooter />
    </>
  );
}
