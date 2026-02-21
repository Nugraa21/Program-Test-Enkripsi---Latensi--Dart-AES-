# 🔐 AES-256 Encryption Dashboard

Web dashboard interaktif untuk testing latensi enkripsi/dekripsi AES-256-CBC.  
Dibuat sebagai versi web dari program Dart `aes_test.dart`.

## 🚀 Cara Menjalankan

**Cukup buka file ini di browser:**

```
web-dashboard/index.html
```

Double-klik file `index.html` → Langsung terbuka di browser!

> **Note:** Harus dibuka dari browser modern (Chrome, Edge, Firefox terbaru).  
> Tidak memerlukan server atau instalasi apapun!

---

## 📁 Struktur Folder

```
web-dashboard/
├── index.html   ← File utama (buka ini di browser)
├── style.css    ← Styling dark premium theme
├── app.js       ← Logika enkripsi WebCrypto AES-256-CBC
└── README.md    ← Panduan ini
```

---

## ✨ Fitur Dashboard

| Tab | Fungsi |
|-----|--------|
| 🏠 Dashboard | Statistik, grafik latensi live, aktivitas terbaru |
| 🔒 Enkripsi Manual | Enkripsi teks/JSON dengan AES-256-CBC |
| 🔓 Dekripsi Manual | Dekripsi ciphertext Base64 |
| 📄 Batch Test JSON | Enkripsi seluruh array JSON + laporan ukuran file |
| 📈 Log Latensi | Riwayat latensi semua operasi (export .log) |
| 📋 Log Data | Catatan lengkap setiap operasi |
| ⚙️ Pengaturan Kunci | Set kunci AES, upload key.json |

---

## 🔑 Kunci Default

Kunci dari project Dart digunakan secara otomatis:

```
SkadutaPresensi2025SecureKey1234
```

Atau upload file `key.json` dari folder project Dart.

---

## 🔧 Kompatibilitas

- ✅ Chrome / Edge (Chromium) — Direkomendasikan
- ✅ Firefox
- ✅ Safari (iOS/macOS)
- ❌ Internet Explorer (tidak support WebCrypto)

---

## 📊 Tentang AES-256-CBC

| Parameter | Nilai |
|-----------|-------|
| Algoritma | AES-256-CBC |
| Ukuran Kunci | 256-bit (32 byte) |
| Block Size | 128-bit (16 byte) |
| IV | Random 16 byte |
| Jumlah Round | 14 round |
| Output | Base64 (IV + Ciphertext) |

**Mengapa dekripsi lebih lambat dari enkripsi?**  
Dekripsi memerlukan *Inverse Key Schedule* — setiap round key harus dikenai `InvMixColumns` (operasi GF 2⁸) sebelum dipakai. AES-256 = 14 iterasi overhead ini.

---

*Web dashboard ini kompatibel 100% dengan implementasi Dart `ApiEncryption` (AES-CBC, key=32 byte, IV prefix 16 byte, output Base64)*
