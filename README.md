# HENDAR BOT WA — Railway

Website Node.js + Express untuk daftar/login, Free Trial 24 jam, katalog 5 paket, checkout QRIS Zapay, cek/batal transaksi, pengiriman kode setelah status `paid`, dan panel owner untuk mengelola stok kode.

## Harga paket
Edit `config.js`. Harga default:
- 7 Hari: Rp10.000
- 14 Hari: Rp18.000
- 30 Hari: Rp30.000
- 60 Hari: Rp50.000
- 90 Hari: Rp70.000

Harga 14/30/60/90 hari adalah contoh dan boleh diubah sebelum deploy.

## Deploy ke Railway
1. Ekstrak ZIP ini.
2. Upload seluruh folder ke GitHub repository (jangan upload `.env`).
3. Railway → New Project → Deploy from GitHub Repo → pilih repository.
4. Di Variables, isi:
   - `APP_URL` = domain website kamu (opsional untuk versi ini)
   - `SESSION_SECRET` = random secret panjang minimal 32 karakter
   - `OWNER_EMAIL` = email owner
   - `OWNER_PASSWORD` = password owner yang kuat
   - `ZAPAY_API_KEY` = API key Zapay yang baru/aktif
   - `ZAPAY_BASE_URL` = `https://zapay.zannmods.net/api/v1`
   - `DATA_DIR` = `/data`
   - `DISCORD_WEBHOOK_URL` = opsional, isi Discord webhook jika ingin notifikasi pembayaran sukses
5. Tambahkan Railway Volume pada service dan mount path `/data`. Ini penting agar akun, transaksi, dan stok kode tidak hilang saat redeploy/restart.
6. Deploy. Railway akan menjalankan `npm start`.
7. Tambahkan domain milikmu di Settings → Networking → Custom Domain, lalu ikuti DNS record yang diberikan Railway.

## Cara owner
Login menggunakan `OWNER_EMAIL` dan `OWNER_PASSWORD` dari Railway Variables. Tombol Owner akan muncul setelah login. Pilih paket, masukkan kode seperti `Hendar1010`, lalu tambahkan. Masukkan stok kode sebelum pelanggan membeli.

## Cara pembeli
Daftar/login → Free Trial (sekali per akun) atau Buy paket → scan QRIS → website mengecek status otomatis. Saat API mengembalikan status `paid`, satu kode yang tersedia untuk paket tersebut ditandai terpakai dan ditampilkan kepada pembeli. Pembeli mengirim kode ke `@Hendarwabot`.

## Penting
- API key tidak ditanam dalam source code; simpan hanya di Railway Variables. Jika API key pernah dibagikan, revoke/rotate dahulu.
- Jangan masukkan API key ke file frontend.
- Status pembayaran diverifikasi dari endpoint Zapay server-side. Jangan mengandalkan redirect browser sebagai bukti pembayaran.
- Stok kode harus tersedia. Jika stok habis saat pembayaran berhasil, panel menampilkan peringatan agar owner menangani pesanan.
- Free Trial di sini adalah pencatatan masa trial di website. Integrasi untuk mengaktifkan trial/kode di bot `@Hendarwabot` perlu endpoint/API dari bot tersebut.
- Database JSON ditujukan untuk satu instance server. Gunakan satu replica dan pasang Railway Volume di `/data`. Untuk traffic besar/multi-instance, pindahkan database ke PostgreSQL.
- Sebelum dipakai pelanggan, uji transaksi nominal kecil di mode yang disediakan penyedia pembayaran dan pastikan kontrak respons API sesuai dokumentasi akunmu.
