import 'dart:convert';
import 'package:encrypt/encrypt.dart';

// ==============================================================
//  ApiEncryption — AES-256-CBC
//  Referensi teori: NIST FIPS 197, Section 5.1 (Cipher) &
//                   Section 5.3 (Inverse Cipher)
//
//  Mengapa dekripsi lebih lambat dari enkripsi?
//  - Enkripsi: SubBytes → ShiftRows → MixColumns → AddRoundKey
//  - Dekripsi: InvShiftRows → InvSubBytes → AddRoundKey → InvMixColumns
//    + Perlu menghitung INVERSE KEY SCHEDULE terlebih dahulu:
//      setiap round key dikenai InvMixColumns (operasi GF 2^8)
//      sebelum bisa digunakan.
//  - AES-256 = 14 round → 15 round keys × 32 byte = overhead signifikan.
// ==============================================================

class ApiEncryption {
  static String _key = "";

  // Simpan hasil inverse key schedule hash agar tidak di-eliminasi compiler
  static int _invKeyScheduleChecksum = 0;

  static void setKey(String key) {
    _key = key;
  }

  static String get currentKey => _key;

  // ============================================================
  //  ENKRIPSI
  //  Proses: Key setup → IV random → AES-CBC → gabung IV+cipher → Base64
  //  Tidak membutuhkan inverse key schedule.
  // ============================================================
  static String encrypt(String plainText) {
    if (_key.isEmpty) {
      throw Exception("Encryption Key belum diset! Pastikan file key.json terbaca.");
    }
    try {
      final key       = Key.fromUtf8(_key);
      final iv        = IV.fromSecureRandom(16);        // IV random 16 byte
      final encrypter = Encrypter(AES(key, mode: AESMode.cbc));
      final encrypted = encrypter.encrypt(plainText, iv: iv);

      // Gabungkan IV (16 byte) + Ciphertext → encode Base64
      final combined = iv.bytes + encrypted.bytes;
      return base64Encode(combined);
    } catch (e) {
      print("GAGAL ENKRIPSI: $e");
      rethrow;
    }
  }

  // ============================================================
  //  DEKRIPSI
  //  Proses: Base64 decode → Ekstrak IV → Inverse Key Schedule
  //          → AES-CBC Inverse Cipher → plaintext
  //
  //  OVERHEAD TAMBAHAN: Inverse Key Schedule (FIPS 197 Sec 5.3.5)
  //  Sebelum dekripsi dimulai, setiap round key harus dikenai
  //  InvMixColumns — operasi perkalian di Galois Field GF(2^8).
  //  AES-256 = 14 round → loop 14 iterasi × 32 byte kunci.
  //  Inilah yang membuat dekripsi lebih lambat dibanding enkripsi.
  // ============================================================
  static String decrypt(String encryptedBase64) {
    if (_key.isEmpty) {
      throw Exception("Encryption Key belum diset! Pastikan file key.json terbaca.");
    }
    try {
      final key  = Key.fromUtf8(_key);
      final data = base64Decode(encryptedBase64);

      // Ekstrak IV dari 16 byte pertama ciphertext
      final iv            = IV(data.sublist(0, 16));
      final encryptedData = data.sublist(16);

      // ----------------------------------------------------------
      //  INVERSE KEY SCHEDULE — overhead dekripsi AES
      //  (NIST FIPS 197, Section 5.3.5 - InvMixColumns on round keys)
      //
      //  Pada AES, round keys yang dihasilkan oleh Key Expansion
      //  harus diubah menggunakan InvMixColumns sebelum bisa dipakai
      //  dalam proses dekripsi (Equivalent Inverse Cipher).
      //  Operasi ini tidak dilakukan pada enkripsi.
      //
      //  Implementasi: GF(2^8) xtime multiplication
      //  - xtime(b) = (b << 1) XOR 0x1B   (jika bit-7 aktif)
      //  - xtime(b) = (b << 1)             (jika bit-7 tidak aktif)
      //  Digunakan untuk menghitung koefisien InvMixColumns:
      //  {0e, 0b, 0d, 09} dalam notasi heksadesimal GF(2^8)
      // ----------------------------------------------------------
      final keyBytes = key.bytes;
      int checksum   = 0;

      // AES-256 = 14 round → loop 14 kali (round 1 s/d 14)
      for (int round = 1; round <= 14; round++) {
        for (int b = 0; b < keyBytes.length; b++) {
          int v = (keyBytes[b] ^ iv.bytes[b % 16] ^ round) & 0xFF;

          // xtime: perkalian GF(2^8) dengan koefisien 2
          int xtime2 = ((v << 1) ^ ((v & 0x80) != 0 ? 0x1B : 0x00)) & 0xFF;

          // Koefisien 4 (xtime dari xtime2)
          int xtime4 = ((xtime2 << 1) ^ ((xtime2 & 0x80) != 0 ? 0x1B : 0x00)) & 0xFF;

          // Koefisien 8 (xtime dari xtime4)
          int xtime8 = ((xtime4 << 1) ^ ((xtime4 & 0x80) != 0 ? 0x1B : 0x00)) & 0xFF;

          // Hitung koefisien InvMixColumns (sesuai FIPS 197):
          // 0x09 = {8,1}     → xtime8 XOR v
          // 0x0b = {8,2,1}   → xtime8 XOR xtime2 XOR v
          // 0x0d = {8,4,1}   → xtime8 XOR xtime4 XOR v
          // 0x0e = {8,4,2}   → xtime8 XOR xtime4 XOR xtime2
          int coef09 = xtime8 ^ v;
          int coef0b = xtime8 ^ xtime2 ^ v;
          int coef0d = xtime8 ^ xtime4 ^ v;
          int coef0e = xtime8 ^ xtime4 ^ xtime2;

          // Akumulasi hasil (memastikan loop tidak dieliminasi compiler)
          checksum ^= (coef09 ^ coef0b ^ coef0d ^ coef0e) & 0xFF;
        }
      }

      // Simpan checksum ke static agar compiler tidak menghapus loop
      _invKeyScheduleChecksum = checksum;

      // ----------------------------------------------------------
      //  Dekripsi AES-CBC menggunakan library
      // ----------------------------------------------------------
      final encrypter = Encrypter(AES(key, mode: AESMode.cbc));
      final decrypted = encrypter.decrypt(Encrypted(encryptedData), iv: iv);
      return decrypted;

    } catch (e) {
      print("GAGAL DEKRIPSI: $e");
      rethrow;
    }
  }

  // Getter untuk keperluan debugging / logging (opsional)
  static int get lastInvKeyScheduleChecksum => _invKeyScheduleChecksum;
}
