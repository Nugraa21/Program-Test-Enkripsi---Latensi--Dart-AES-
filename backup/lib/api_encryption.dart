import 'dart:convert';
import 'package:encrypt/encrypt.dart';

class ApiEncryption {
  static String _key = "";

  static void setKey(String key) {
    _key = key;
  }

  static String get currentKey => _key;

  static String encrypt(String plainText) {
    if (_key.isEmpty) {
      throw Exception("Encryption Key belum diset! Pastikan file key.json terbaca.");
    }
    try {
      final key = Key.fromUtf8(_key);
      final iv = IV.fromSecureRandom(16);
      final encrypter = Encrypter(AES(key, mode: AESMode.cbc));
      final encrypted = encrypter.encrypt(plainText, iv: iv);
      final combined = iv.bytes + encrypted.bytes;
      return base64Encode(combined);
    } catch (e) {
      print("GAGAL ENKRIPSI: $e");
      rethrow;
    }
  }

  static String decrypt(String encryptedBase64) {
    if (_key.isEmpty) {
      throw Exception("Encryption Key belum diset! Pastikan file key.json terbaca.");
    }
    try {
      final key = Key.fromUtf8(_key);
      final encrypter = Encrypter(AES(key, mode: AESMode.cbc));
      final data = base64Decode(encryptedBase64);
      final iv = IV(data.sublist(0, 16));
      final encryptedData = data.sublist(16);
      final decrypted = encrypter.decrypt(Encrypted(encryptedData), iv: iv);
      return decrypted;
    } catch (e) {
      print("GAGAL DEKRIPSI: $e");
      rethrow;
    }
  }
}
