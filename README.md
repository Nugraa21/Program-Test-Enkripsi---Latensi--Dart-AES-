# Program Test Enkripsi & Latensi (Dart AES)

Program ini adalah *command-line tool* sederhana untuk menguji fungsionalitas dan performa (latensi) enkripsi AES-256 (CBC Mode).

## Fitur Utama
1. **Bahasa Indonesia**: Antarmuka terminal menggunakan Bahasa Indonesia.
2. **Kunci Dinamis**: Menggunakan file `key.json` untuk menyimpan kunci enkripsi, sehingga tidak hardcoded di dalam script utama (namun tetap menggunakan kunci default yang diminta).
3. **Menu Interaktif**:
   - **Enkripsi Manual**: Masukkan teks -> Hasilkan Ciphertext.
   - **Dekripsi Manual**: Masukkan Ciphertext -> Kembali ke Teks Asli.
   - **Test Latensi Massal**: Menjalankan test otomatis pada daftar kata yang ada di `data.json` untuk mengukur kecepatan rata-rata.
4. **Pemisahan Log**:
   - `data.log`: Menyimpan riwayat data (teks asli dan hasil enkripsi).
   - `latency.log`: Menyimpan riwayat kecepatan performa (dalam milidetik).

## Cara Instalasi

Pastikan Anda sudah menginstall **Dart SDK**.

1. Buka terminal di folder project ini:
   ```bash
   cd "Test program"
   ```

2. Download dependensi yang dibutuhkan:
   ```bash
   dart pub get
   ```

## Cara Penggunaan

Jalankan program utama dengan perintah:

```bash
dart bin/aes_test.dart
```

### Menu Utama
Setelah dijalankan, Anda akan melihat menu seperti berikut:

```text
=============================================
     Aplikasi Test Latensi AES (Dart)
=============================================
1. Enkripsi Data Manual
2. Dekripsi Data Manual
3. Test Latensi Massal (dari data.json)
4. Lihat Log Latensi Terakhir
5. Lihat Log Data Terakhir
6. Keluar
=============================================
```

- **Pilih 1**: Untuk mencoba mengenkripsi satu kalimat. Hasilnya akan tampil di layar dan disimpan ke log.
- **Pilih 2**: Untuk mendekripsi kode (base64) yang sudah dienkripsi sebelumnya. Pastikan string yang dimasukkan lengkap.
- **Pilih 3**: Untuk mengetest kecepatan program dengan banyak data sekaligus. Data diambil dari file `data.json`. Anda juga akan ditawarkan untuk menambah data test baru di sini.
- **Pilih 4 & 5**: Untuk melihat riwayat log langsung dari terminal tanpa membuka file.

## Struktur File
- **bin/aes_test.dart**: Program utama (main loop).
- **lib/api_encryption.dart**: Logic enkripsi/dekripsi AES.
- **key.json**: Tempat menyimpan kunci 32-karakter.
- **data.json**: Database sederhana untuk kata-kata test massal.
- **data.log**: Log isi pesan (data).
- **latency.log**: Log kecepatan proses.

## Catatan Teknis
- Algoritma: AES-256 CBC Mode.
- IV (Initialization Vector): 16 bytes random, digabungkan di awal hasil enkripsi.
- Key: Harus tepat 32 karakter utf-8.
