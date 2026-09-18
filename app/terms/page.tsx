import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

export const metadata = {
  title: 'Syarat & Ketentian — Agent Saya',
  description:
    'Syarat dan ketentuan penggunaan layanan AI Sales Agent Agent Saya.',
};

export default function TermsPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-primary/5 py-16">
        <div className="container mx-auto max-w-3xl px-4 md:px-8">
          <Link
            href="/"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-6"
          >
            ← Kembali ke Beranda
          </Link>

          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground mb-2">
            Syarat & Ketentuan
          </h1>
          <p className="text-sm text-muted-foreground mb-8">
            Terakhir diperbarui: {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>

          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
            <section>
              <h2 className="font-display text-xl font-semibold text-foreground">1. Deskripsi Layanan</h2>
              <p>
                Agent Saya menyediakan platform SaaS berbasis AI yang memungkinkan pengguna membuat AI Sales Agent
                otomatis dari dokumen PDF atau gambar yang diunggah. AI Agent yang dihasilkan dapat digunakan untuk
                menjawab pertanyaan calon pelanggan secara otomatis melalui WhatsApp dan antarmuka web.
              </p>
              <p>
                Dengan mengakses dan/atau menggunakan layanan kami, Anda dianggap telah membaca, memahami, dan
                menyetujui ketentuan dalam dokumen Syarat & Ketentuan ini secara penuh.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-foreground">2. Ketentuan Langganan &amp; Pembayaran</h2>
              <p>
                Kami menyediakan layanan dengan dua opsi akses:
              </p>
              <ul>
                <li>
                  <strong>Free Trial 3 hari:</strong> Pengguna baru dapat mencoba layanan kami secara gratis selama 3 (tiga)
                  hari pertama tanpa perlu melakukan pembayaran. Masa trial otomatis berakhir setelah 3 hari dan layanan
                  akan dinonaktifkan jika belum ada langganan yang dibuat.
                </li>
                <li>
                  <strong>Paket Berbayar:</strong> Setelah masa trial berakhir, Anda dapat memilih langganan berikut:
                  <ul className="mt-2 space-y-1">
                    <li>• Bulanan: Rp 49.000/bulan</li>
                    <li>• Tahunan: Rp 399.000/tahun (hemat hingga 17% dibandingkan paket bulanan)</li>
                  </ul>
                </li>
              </ul>
              <p>
                Semua pembayaran diproses melalui Payment Gateway resmi yang kami gunakan. Dengan menyelesaikan
                transaksi, Anda menyetujuai bahwa paket yang dipilih akan otomatis aktif dan terus berlanjut hingga
                Anda memutuskan berhenti (untuk paket berulang) sesuai ketentuan di atas.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-foreground">3. Kebijakan Pengembalian Dana / Refund</h2>
              <p>
                Kami menyarankan agar Anda memanfaatkan <strong>Free Trial 3 hari</strong> terlebih dahulu untuk
                sepenuhnya bereksperimen dengan layanan kami sebelum melakukan pembayaran.
              </p>
              <p>
                <strong>Pembayaran yang sudah berhasil tidak dapat di-refund</strong> kembali ke akun asal, kecuali
                terjadi kendala teknis yang terbukti berasal dari sistem kami (misalnya layanan tidak dapat diakses sama
                sekali selama periode langganan tertentu). Setiap permintaan refund akan ditinjau dan diputuskan
                keputekannya oleh tim kami berdasarkan bukti dan alasan yang disampaikan.
              </p>
              <p>
                Untuk mengajukan permintaan refund dikarenakan kendala teknis, silakan hubungi kami di{' '}
                <a href="mailto:halo@agentsaya.site" className="text-primary hover:underline">halo@agentsaya.site</a>.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-foreground">4. Pembatasan Tanggung Jawab</h2>
              <ul className="space-y-2">
                <li>
                  <strong>Isi Dokumen:</strong> Pengguna bertanggung jawab penuh atas isi dokumen PDF atau gambar yang
                  diunggah ke platform kami. Pastikan dokumen yang Anda unggah tidak melanggar hukum, tidak mengandung
                  materi yang melarang, dan tidak melanggar hak pihak ketiga.
                </li>
                <li>
                  <strong>Keakuratan Output AI:</strong> AI Agent yang kami haskanakan dapat memberikan jawaban yang
                  tidak selalu 100% akurat atau relevan. Pengguna harus memverifikasi informasi yang diberikan AI
                  sebelum mengambil keputusan penting.
                </li>
                <li>
                  <strong>Tanggung Jawab Pihak Ketiga:</strong> Kami tidak bertanggung jawab atas tindakan, keputusan,
                  atau kerusakan yang timbul dari penggunaan layanan ini oleh pengguna atau pihak ketiga yang
                  mengakses AI Agent yang Anda buat.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-foreground">5. Hak Cipta</h2>
              <p>
                Seluruh konten, desain, logo, dan antarmuka pada platform ini adalah milik eksklusif Agent Saya dan
                dilindungi oleh undang-undang hak cipta. Anda tidak diperbolehkan menyalin, mendistribusikan, atau
                menggunakan kembali materi kami tanpa izin tertulis.
              </p>
              <p>
                Dokumen yang diunggah pengguna digunakan semata-mata untuk menggenerasikan AI Agent sesuai
                kebutuhan pengguna tersebut.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-foreground">6. Kami Berhak Modifikasi</h2>
              <p>
                Kami berhak mengubah Syarat & Ketentian ini kapan saja. Perubahan yang material akan kami beritakan
                melalui email atau notifikasi di dalam aplikasi. Dengan terus menggunakan layanan kami setelah
                perubahan berlaku, Anda menyetujui syarat baru yang telah diperbarui.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-foreground">7. Kontak</h2>
              <p>
                Jika Anda memiliki pertanyaan tentang Syarat & Ketentuan ini, silakan hubungi kami di:
              </p>
              <ul>
                <li>Email: <a href="mailto:halo@agentsaya.site" className="text-primary hover:underline">halo@agentsaya.site</a></li>
                <li>WhatsApp: +62 812 0000 0000</li>
              </ul>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
