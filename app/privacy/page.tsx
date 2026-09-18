import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

export const metadata = {
  title: 'Kebijakan Privasi — Agent Saya',
  description:
    'Kebijakan privasi penggunaan data pribadi dan dokumen pengguna platform Agent Saya.',
};

export default function PrivacyPage() {
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
            Kebijakan Privasi
          </h1>
          <p className="text-sm text-muted-foreground mb-8">
            Terakhir diperbarui: {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>

          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
            <p>
              Kebijakan Privasi ini menjelaskan cara kami mengumpulkan, memproses, dan melindungi data Anda
              ketika menggunakan layanan Agent Saya. Dengan mengakses atau menggunakan platform kami, Anda
              menyetujui kebijakan ini secara penuh.
            </p>

            <section>
              <h2 className="font-display text-xl font-semibold text-foreground">1. Data Yang Kami Kumpulkan</h2>
              <p>Data pribadi yang kami kumpulkan meliputi:</p>
              <ul>
                <li>• Nama lengkap</li>
                <li>• Alamat email</li>
                <li>• Nomor WhatsApp</li>
                <li>• Dokumen &amp; gambar yang diunggah (PDF, gambar, dll.)</li>
              </ul>
              <p>
                Dokumen dan gambar yang Anda unggah digunakan semata-mata untuk menghasilkan AI Agent yang
                sesuai dengan kebutuhan Anda.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-foreground">2. Penggunaan Data</h2>
              <p>Data yang kami kumpulkan hanya digunakan untuk:</p>
              <ul>
                <li>
                  • Memproses dan menghasilkan AI Agent berdasarkan dokumen/gambar yang Anda unggah.
                </li>
                <li>
                  • Mengelola akun, langganan, dan akses layanan Anda.
                </li>
                <li>
                  • Mengirimkan notifikasi terkait status langganan, trial, dan transaksi pembayaran.
                </li>
                <li>
                  • Memberikan dukungan teknis jika diperlukan.
                </li>
              </ul>
              <p>
                Kami tidak akan menggunakan data Anda untuk keperluan lain tanpa mendapatkan izin dari Anda
                terlebih dahulu.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-foreground">3. Keamanan Data</h2>
              <p>
                Kami menggunakan langkah-langkah keamanan yang wajar untuk melindungi data Anda, termasuk
                enkripsi pada saat transmisi dan penyimpanan. Dokumen dan gambar yang Anda unggah diproses
                dengan aman dan hanya dapat diakses oleh sistem kami untuk tujuan generasi AI Agent.
              </p>
              <p>
                Kami <strong>tidak menjual, menyewakan, atau membagikan data Anda ke pihak ketiga</strong>
                untuk keperluan pemasaran atau komersial lainnya. Data Anda tidak akan dibagikan kecuali
                sebagaimana diperlukan untuk menyelesaikan layanan yang Anda minta (misalnya kepada Payment
                Gateway untuk proses transaksi).
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-foreground">4. Pemrosesan Pembayaran</h2>
              <p>
                Semua transaksi pembayaran diproses secara aman melalui mitra Payment Gateway resmi kami.
                Kami tidak menyimpan data kartu kredit, nomor rekening, atau informasi pembayaran sensitif
                di server kami. Data pembayaran hanya ditangani oleh pihak ketiga yang terpercaya yang
                bertanggung jawab atas keamanan transaksi tersebut.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-foreground">5. Retensi Data</h2>
              <p>
                Kami akan menyimpan data pribadi Anda selama akun Anda masih aktif dan sesuai dengan
                kebutuhan untuk menyediakan layanan. Jika akun Anda tidak aktif dalam jangka panjang, kami
                berhak menghapus data yang tidak lagi diperlukan. Dokumen/gambar yang diunggah dapat
                disimpan selama periode tertentu untuk memungkinkan AI Agent berfungsi dengan baik.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-foreground">6. Perubahan Kebijikan Privasi</h2>
              <p>
                Kami dapat memperbarui Kebijakan Privasi ini dari waktu ke waktu. Setiap perubahan yang
                material akan kami beritahu melalui email atau notifikasi di dalam aplikasi. Dengan terus
                menggunakan layanan kami setelah perubahan berlaku, Anda menyetujui kebijikan privasi yang
                telah diperbarui.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-foreground">7. Kontak</h2>
              <p>
                Jika Anda memiliki pertanyaan tentang Kebijikan Privasi ini, silakan hubungi kami di:
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
