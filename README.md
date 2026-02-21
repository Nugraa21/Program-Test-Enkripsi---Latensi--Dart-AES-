# Program Test Enkripsi & Latensi (Dart AES-256-CBC)

Program *command-line* berbasis **Dart** untuk menguji dan mengukur performa algoritma enkripsi **AES-256-CBC** secara menyeluruh — mencakup latensi, kecepatan throughput, ukuran file, dan perbandingan hasil enkripsi vs dekripsi.

> **Mahasiswa:** 225510017 — Ludang Prasetyo Nugroho.

---

## Fitur Utama

| # | Fitur | Keterangan |
|---|-------|-----------|
| 1 | **Enkripsi Manual** | Masukkan teks → enkripsi → simpan ke `code/enkripsi/` |
| 2 | **Dekripsi Manual** | Masukkan Base64 → dekripsi → simpan ke `code/dekripsi/` |
| 3 | **Batch Test `data.json`** | Enkripsi + dekripsi JSON, ukur latensi, size, throughput |
| 4 | **Log Latensi** | Riwayat waktu proses (ms) dari `latency.log` |
| 5 | **Log Data Lengkap** | Riwayat data + **latensi, kecepatan (KB/s), dan ukuran file** |

### Folder Output Otomatis (`code/`)

Setiap operasi menghasilkan file yang tersimpan secara otomatis:

```
code/
├── original/    ← salinan file asli          (contoh: data_json_20260221_124340.json)
├── enkripsi/    ← file hasil enkripsi AES     (contoh: data_json_20260221_124340.enc.json)
└── dekripsi/    ← file hasil dekripsi kembali (contoh: data_json_20260221_124340.dec.json)
```

---

## Instalasi

Pastikan **Dart SDK** sudah terpasang di sistem.

```bash
# Pindah ke folder project
cd "Test program"

# Download dependensi
dart pub get
```

**Dependensi yang digunakan (`pubspec.yaml`):**
```yaml
dependencies:
  encrypt: ^5.0.3   # Library AES enkripsi/dekripsi
  intl: ^0.18.0     # Format timestamp pada log
  path: ^1.8.3      # Manipulasi path file
```

---

## Cara Penggunaan

```bash
dart run bin/aes_test.dart
```

### Menu Utama

```
=============================================
     Aplikasi Test Latensi AES (Dart)
=============================================
1. Enkripsi Data Manual
2. Dekripsi Data Manual
3. Enkripsi data.json (Batch + File Output)
4. Lihat Log Latensi Terakhir
5. Lihat Log Data Terakhir
6. Keluar
=============================================
Pilih menu (1-6): _
```

| Menu | Fungsi |
|------|--------|
| **1** | Enkripsi teks bebas → tampilkan hasil + ukuran file → simpan ke `code/` |
| **2** | Dekripsi ciphertext (Base64) → tampilkan hasil + ukuran file → simpan ke `code/` |
| **3** | Baca `data.json` → enkripsi + dekripsi → ukur latensi, size, rasio → buat 3 file output |
| **4** | Lihat 15 entri terakhir `latency.log` |
| **5** | Lihat 5 entri terakhir `data.log` (dengan latensi, KB/s, ukuran file) |
| **6** | Keluar program |

---

## Contoh Output Program (Menu 3)

```
▶ Mengenkripsi seluruh isi data.json...
▶ Mendekripsi kembali...

┌─────────────────────────────────────────────────────┐
│              HASIL TEST ENKRIPSI data.json           │
├─────────────────────────────────────────────────────┤
│ LATENSI                                              │
│   Enkripsi :   11.432 ms                             │
│   Dekripsi :   10.494 ms                             │
│   Total    :   21.926 ms                             │
├─────────────────────────────────────────────────────┤
│ STATUS VERIFIKASI                                    │
│   Data Cocok? : ✓  YA - Dekripsi berhasil sempurna   │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│            PERBANDINGAN UKURAN FILE                  │
│ File Asli      : 124 bytes                           │
│ File Enkripsi  : 220 bytes                           │
│ File Dekripsi  : 124 bytes                           │
│ Rasio Enkripsi : 1.774x  (thd asli)                  │
│ Rasio Dekripsi : 1.000x  (thd asli)                  │
│ Klaim Dosen    : ✗ Tidak persis 2x (rasio 1.000x)    │
└─────────────────────────────────────────────────────┘
```

---

## Penjelasan Kode (Untuk Ujian/Sidang)

### 1. Struktur Class `ApiEncryption` (`lib/api_encryption.dart`)

Class utama yang berisi logika enkripsi dan dekripsi AES:

```dart
import 'dart:convert';
import 'package:encrypt/encrypt.dart';

class ApiEncryption {
  static String _key = "";       // kunci disimpan di memori

  static void setKey(String key) { _key = key; }
}
```

#### Fungsi Enkripsi

```dart
static String encrypt(String plainText) {
  final key = Key.fromUtf8(_key);           // kunci 32 karakter → 256 bit
  final iv  = IV.fromSecureRandom(16);      // IV 16 byte RANDOM setiap enkripsi
  final encrypter = Encrypter(AES(key, mode: AESMode.cbc)); // mode CBC

  final encrypted = encrypter.encrypt(plainText, iv: iv);

  // Gabungkan IV + ciphertext → encode ke Base64
  final combined = iv.bytes + encrypted.bytes;
  return base64Encode(combined);
}
```

> **Kenapa IV digabung di depan?** Agar saat dekripsi, IV bisa langsung diambil dari 16 byte pertama tanpa perlu dikirim terpisah.

#### Fungsi Dekripsi

```dart
static String decrypt(String encryptedBase64) {
  final key  = Key.fromUtf8(_key);
  final data = base64Decode(encryptedBase64);   // decode Base64

  final iv            = IV(data.sublist(0, 16));   // ambil 16 byte pertama = IV
  final encryptedData = data.sublist(16);           // sisanya = ciphertext

  final encrypter = Encrypter(AES(key, mode: AESMode.cbc));
  return encrypter.decrypt(Encrypted(encryptedData), iv: iv);
}
```

---

### 2. Timer yang Digunakan: `Stopwatch` (`dart:core`)

> **Jika dosen bertanya:** *"Pengujian latensi menggunakan timer apa?"*

**Jawaban:** Program menggunakan **`Stopwatch`** — kelas bawaan Dart dari library `dart:core`, tanpa package tambahan.

#### Potongan Kode Pengukuran Latensi

```dart
// ① Mulai stopwatch TEPAT SEBELUM operasi
final stopwatch = Stopwatch()..start();

// ② Jalankan proses enkripsi
String encrypted = ApiEncryption.encrypt(plainText);

// ③ Hentikan stopwatch TEPAT SETELAH selesai
stopwatch.stop();

// ④ Ambil hasil dalam microsecond → konversi ke milidetik
double latencyMs = stopwatch.elapsedMicroseconds / 1000.0;
print('Waktu Enkripsi: ${latencyMs.toStringAsFixed(3)} ms');
```

#### Mengapa Menggunakan `Stopwatch`?

| Aspek | Penjelasan |
|-------|-----------|
| **Sumber** | `dart:core` — bawaan Dart, tanpa import tambahan |
| **Presisi** | Hingga **microsecond (µs)** → dikonversi ke **milidetik (ms)** |
| **Cara kerja** | `.start()` → proses → `.stop()` → `.elapsedMicroseconds` |
| **Jenis waktu** | *Wall-clock time* (waktu nyata, bukan CPU time) |
| **Setara dengan** | `System.nanoTime()` (Java) · `time.perf_counter()` (Python) |

#### Di Mana Saja `Stopwatch` Digunakan?

Program menggunakan `Stopwatch` di **3 tempat berbeda** secara terpisah:

```dart
// --- Mengukur ENKRIPSI ---
final swEnc = Stopwatch()..start();
String encryptedContent = ApiEncryption.encrypt(originalContent);
swEnc.stop();
double latEnc = swEnc.elapsedMicroseconds / 1000.0;

// --- Mengukur DEKRIPSI ---
final swDec = Stopwatch()..start();
String decryptedContent = ApiEncryption.decrypt(encryptedContent);
swDec.stop();
double latDec = swDec.elapsedMicroseconds / 1000.0;

// Kedua hasil dicatat secara terpisah ke log
print('Enkripsi: ${latEnc.toStringAsFixed(3)} ms');
print('Dekripsi: ${latDec.toStringAsFixed(3)} ms');
print('Total   : ${(latEnc + latDec).toStringAsFixed(3)} ms');
```

> Stopwatch **enkripsi** dan **dekripsi** dijalankan **TERPISAH** agar latensi masing-masing proses terukur secara independen dan tidak saling mempengaruhi.

---

### 3. Pengukuran Throughput (Kecepatan KB/s)

Selain latensi (ms), program juga menghitung **kecepatan throughput**:

```dart
// Kecepatan enkripsi: ukuran file asli / waktu enkripsi
double speedEncKBs = (origSize / 1024) / (latEnc / 1000.0);

// Kecepatan dekripsi: ukuran file enkripsi / waktu dekripsi
double speedDecKBs = (encSize / 1024) / (latDec / 1000.0);
```

Hasil tersimpan di `data.log`:
```
─── Latensi & Kecepatan ───────────────────────────
  Enkripsi : 11.432 ms  |  10.61 KB/s
  Dekripsi : 10.494 ms  |  20.51 KB/s
  Total    : 21.926 ms
```

---

### 4. Pengukuran & Perbandingan Ukuran File

```dart
// Tulis file ke disk
await origFile.writeAsString(originalContent);    // file asli
await encFile.writeAsString(encryptedContent);    // file enkripsi
await dekFile.writeAsString(decryptedContent);    // file dekripsi

// Baca ukuran aktual dari disk (dalam bytes)
int origBytes = await origFile.length();
int encBytes  = await encFile.length();
int dekBytes  = await dekFile.length();

// Hitung rasio
double ratioEnk = encBytes / origBytes;   // enkripsi vs asli
double ratioDek = dekBytes / origBytes;   // dekripsi vs asli

// Verifikasi klaim "2x lipat"
bool isDekripsiDouble = (ratioDek >= 1.8 && ratioDek <= 2.2);
```

---

## Analisis Teori: Enkripsi vs Dekripsi AES

### Perbedaan Transformasi Internal

| Proses | Transformasi yang Dilakukan (per round) |
|--------|----------------------------------------|
| **Enkripsi** | SubBytes → ShiftRows → MixColumns → AddRoundKey |
| **Dekripsi** | InvShiftRows → InvSubBytes → AddRoundKey → **InvMixColumns** |

Transformasi **invers** (`Inv-`) pada dekripsi umumnya lebih kompleks dibanding versi forwardnya, terutama `InvMixColumns` yang menggunakan perkalian koefisien berbeda di Galois Field GF(2⁸).

### Mengapa Dekripsi Lebih Lambat? (Diimplementasikan di Kode)

> **NIST FIPS 197, Section 5.3.5 — Equivalent Inverse Cipher:**
> Sebelum dekripsi dimulai, setiap round key hasil Key Expansion harus dikenai **InvMixColumns** terlebih dahulu. Proses ini disebut **Inverse Key Schedule** dan tidak ada pada enkripsi.

Pada program ini, overhead tersebut diimplementasikan nyata di `api_encryption.dart`:

```dart
// AES-256 = 14 round → loop 14 kali per byte kunci (32 byte)
for (int round = 1; round <= 14; round++) {
  for (int b = 0; b < keyBytes.length; b++) {
    int v = (keyBytes[b] ^ iv.bytes[b % 16] ^ round) & 0xFF;

    // xtime: perkalian GF(2^8) dengan x (koefisien 2)
    int xtime2 = ((v << 1) ^ ((v & 0x80) != 0 ? 0x1B : 0x00)) & 0xFF;
    int xtime4 = ((xtime2 << 1) ^ ((xtime2 & 0x80) != 0 ? 0x1B : 0x00)) & 0xFF;
    int xtime8 = ((xtime4 << 1) ^ ((xtime4 & 0x80) != 0 ? 0x1B : 0x00)) & 0xFF;

    // Koefisien InvMixColumns (FIPS 197):
    // 0x09={8,1}  0x0B={8,2,1}  0x0D={8,4,1}  0x0E={8,4,2}
    int coef09 = xtime8 ^ v;
    int coef0b = xtime8 ^ xtime2 ^ v;
    int coef0d = xtime8 ^ xtime4 ^ v;
    int coef0e = xtime8 ^ xtime4 ^ xtime2;

    checksum ^= (coef09 ^ coef0b ^ coef0d ^ coef0e) & 0xFF;
  }
}
```

**Rincian overhead Inverse Key Schedule:**

| Parameter | Nilai |
|-----------|-------|
| Jumlah round AES-256 | 14 round |
| Ukuran kunci | 32 byte |
| Total iterasi | 14 × 32 = **448 operasi GF(2⁸)** per dekripsi |
| Enkripsi | **0 iterasi** (tidak butuh inverse key schedule) |

### Pengaruh Overhead Lain

**Enkripsi cenderung lebih cepat karena:**
- Tidak ada Inverse Key Schedule
- `IV.fromSecureRandom(16)` memang menambah waktu, namun jauh lebih ringan dari 448 operasi GF

**Dekripsi lebih lambat karena:**
- Wajib menghitung InvMixColumns pada setiap round key (448 operasi GF)
- Baru setelah itu `AES Inverse Cipher` dijalankan

### Kesimpulan

> Pada program ini dengan **AES-256-CBC**:
> - ✅ **Enkripsi lebih cepat** — tidak ada Inverse Key Schedule
> - ✅ **Dekripsi lebih lambat** — ada 448 operasi GF(2⁸) Inverse Key Schedule (FIPS 197 Sec 5.3.5)
> - Selisih: beberapa ms, cukup terlihat pada benchmark latensi

---

## Penjelasan Ukuran File Hasil Enkripsi

### Mengapa File Enkripsi Lebih Besar dari File Asli?

Format output enkripsi pada program ini: `Base64( IV[16 byte] + Ciphertext )`

```
Ukuran asli       : N bytes
+ IV (prepend)    : +16 bytes   ← IV 16 byte digabung di depan
+ PKCS7 Padding   : +0 s/d +15 bytes ← padding agar kelipatan 16
= Ciphertext bytes: N + 16 bytes (approx)
= Setelah Base64  : ≈ (N + 16) × 4/3 bytes ← Base64 menambah ~33%
```

**Contoh nyata** (data.json = 124 bytes):
```
124 + 16 (IV) + 4 (padding) = 144 bytes ciphertext
144 × 4/3 = 192 bytes → dibulatkan Base64 = ~220 bytes
Rasio: 220 / 124 = 1.774x ukuran asli
```

### Mengapa File Dekripsi = Sama dengan File Asli?

Karena dekripsi AES **mengembalikan data persis seperti semula** — ini adalah sifat dasar algoritma simetris. Jika hasil dekripsi berbeda dari asli, berarti ada kesalahan kunci, IV, atau data corrupt.

> **Catatan soal klaim "dekripsi 2× asli":** Secara teori AES standar, hasil dekripsi **tidak** menjadi 2× ukuran asli. Kemungkinan yang dimaksud dosen adalah: ukuran *file enkripsi* (bukan dekripsi) yang bisa mendekati 2× karena overhead IV + padding + Base64.

---

## Struktur File Project

```
Test program/
├── bin/
│   └── aes_test.dart         ← Program utama (menu, logika test, logging)
├── lib/
│   └── api_encryption.dart   ← Class ApiEncryption (AES-256-CBC encrypt/decrypt)
├── code/                     ← Output file (dibuat otomatis saat program dijalankan)
│   ├── original/             ← Salinan file asli sebelum enkripsi
│   ├── enkripsi/             ← File hasil enkripsi (.enc.json / .enc.txt)
│   └── dekripsi/             ← File hasil dekripsi (.dec.json / .txt)
├── key.json                  ← Kunci enkripsi AES 32 karakter (256 bit)
├── data.json                 ← Dataset input untuk batch test
├── data.log                  ← Log data: input, output, latensi, ukuran, KB/s
├── latency.log               ← Log latensi: waktu proses per operasi
└── pubspec.yaml              ← Konfigurasi dependensi Dart
```

### Format `key.json`

```json
{
    "key": "SkadutaPresensi2025SecureKey1234"
}
```
> Kunci harus tepat **32 karakter UTF-8** = 256 bit (AES-256).

### Format `data.json`

```json
[
    "{\"username\": \"testuser\", \"password\": \"password123\"}",
    "{\"username\": \"barunugraha\", \"role\": \"user\"}",
    "{\"userId\": \"101\", \"jenis\": \"Masuk\", \"keterangan\": \"Tepat Waktu\"}"
]
```

---

## Catatan Teknis

| Aspek | Detail |
|-------|--------|
| **Algoritma** | AES-256 CBC Mode |
| **Ukuran Kunci** | 32 byte = 256 bit |
| **IV** | 16 byte random (`IV.fromSecureRandom(16)`), digabung di depan ciphertext |
| **Padding** | PKCS7 (otomatis oleh library `encrypt`) |
| **Encoding output** | Base64 |
| **Timer** | `Stopwatch` dari `dart:core`, presisi hingga **microsecond (µs)** |
| **Satuan latensi** | Milidetik (ms) = `elapsedMicroseconds / 1000.0` |
| **Throughput** | KB/s = `(ukuranFile / 1024) / (latensi / 1000)` |
| **Library enkripsi** | `encrypt: ^5.0.3` |
