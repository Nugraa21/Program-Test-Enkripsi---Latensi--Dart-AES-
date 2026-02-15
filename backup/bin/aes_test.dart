import 'dart:convert';
import 'dart:io';
import 'package:intl/intl.dart';
import '../lib/api_encryption.dart';

// File handlers
final File dataLogFile = File('data.log');
final File latencyLogFile = File('latency.log');
final File keyFile = File('key.json');
final File jsonInputFile = File('data.json');

void main() async {
  // 1. Load Key
  if (!await keyFile.exists()) {
    print('Error: key.json tidak ditemukan!');
    return;
  }
  try {
    String keyContent = await keyFile.readAsString();
    Map<String, dynamic> keyJson = jsonDecode(keyContent);
    String key = keyJson['key'];
    ApiEncryption.setKey(key);
    print('Kunci Enkripsi Berhasil Dimuat dari key.json');
  } catch (e) {
    print('Error membaca key.json: $e');
    return;
  }

  // 2. Main Menu Loop
  while (true) {
    print('\n=============================================');
    print('     Aplikasi Test Latensi AES (Dart)');
    print('=============================================');
    print('1. Enkripsi Data Manual');
    print('2. Dekripsi Data Manual');
    print('3. Test Latensi Massal (dari data.json)');
    print('4. Lihat Log Latensi Terakhir');
    print('5. Lihat Log Data Terakhir');
    print('6. Keluar');
    print('=============================================');
    stdout.write('Pilih menu (1-6): ');
    
    String? choice = stdin.readLineSync();

    switch (choice) {
      case '1':
        await menuEncryptManual();
        break;
      case '2':
        await menuDecryptManual();
        break;
      case '3':
        await menuBatchTest();
        break;
      case '4':
        await viewLog(latencyLogFile, "Log Latensi");
        break;
      case '5':
        await viewLog(dataLogFile, "Log Data");
        break;
      case '6':
        print('Keluar program...');
        exit(0);
      default:
        print('Pilihan tidak valid, silakan coba lagi.');
    }
  }
}

Future<void> menuEncryptManual() async {
  stdout.write('\nMasukkan Teks untuk Dienkripsi: ');
  String? text = stdin.readLineSync();
  if (text == null || text.isEmpty) {
    print('Input kosong dibatalkan.');
    return;
  }

  // Measure
  final stopwatch = Stopwatch()..start();
  String encrypted;
  try {
    encrypted = ApiEncryption.encrypt(text);
  } catch (e) {
    print('Enkripsi Gagal: $e');
    return;
  }
  stopwatch.stop();

  double latency = stopwatch.elapsedMicroseconds / 1000.0;
  
  print('\n--- Hasil Enkripsi ---');
  print('Input: $text');
  print('Output (Base64): $encrypted');
  print('Waktu: ${latency.toStringAsFixed(3)} ms');

  // Log
  await logData("ENCRYPT", text, encrypted);
  await logLatency("ENCRYPT", latency);
}

Future<void> menuDecryptManual() async {
  stdout.write('\nMasukkan Ciphertext (Base64) untuk Didekripsi: ');
  String? text = stdin.readLineSync();
  if (text == null || text.isEmpty) {
    print('Input kosong dibatalkan.');
    return;
  }

  // Measure
  final stopwatch = Stopwatch()..start();
  String decrypted;
  try {
    decrypted = ApiEncryption.decrypt(text);
  } catch (e) {
    print('Dekripsi Gagal (Pastikan format Base64 & Key benar): $e');
    return;
  }
  stopwatch.stop();

  double latency = stopwatch.elapsedMicroseconds / 1000.0;
  
  print('\n--- Hasil Dekripsi ---');
  print('Input (Base64): $text');
  print('Output: $decrypted');
  print('Waktu: ${latency.toStringAsFixed(3)} ms');

  // Log
  await logData("DECRYPT", text, decrypted);
  await logLatency("DECRYPT", latency);
}

Future<void> menuBatchTest() async {
  if (!await jsonInputFile.exists()) {
    print('File data.json tidak ditemukan. Membuat file baru...');
    await jsonInputFile.writeAsString(jsonEncode(["Test data 1", "Test data 2"]));
  }

  // Read current List
  String jsonString = await jsonInputFile.readAsString();
  List<dynamic> listData = [];
  try {
    listData = jsonDecode(jsonString);
  } catch(e) {
    print("Error parsing data.json: $e");
    return;
  }

  print('\nLoaded ${listData.length} items dari data.json.');
  stdout.write('Apakah anda ingin menambah data test baru? (y/n): ');
  String? add = stdin.readLineSync();
  if (add != null && add.toLowerCase() == 'y') {
    stdout.write('Masukkan string data baru: ');
    String? newVal = stdin.readLineSync();
    if (newVal != null && newVal.isNotEmpty) {
      listData.add(newVal);
      await jsonInputFile.writeAsString(jsonEncode(listData));
      print('Data berhasil disimpan ke data.json!');
    }
  }

  print('\nMemulai Test Massal...');
  double totalEnc = 0;
  double totalDec = 0;
  int count = 0;

  for (var item in listData) {
    String original = item.toString();
    count++;

    // Encrypt
    final swEnc = Stopwatch()..start();
    String encrypted = ApiEncryption.encrypt(original);
    swEnc.stop();
    double latEnc = swEnc.elapsedMicroseconds / 1000.0;
    totalEnc += latEnc;

    // Decrypt
    final swDec = Stopwatch()..start();
    String decrypted = ApiEncryption.decrypt(encrypted);
    swDec.stop();
    double latDec = swDec.elapsedMicroseconds / 1000.0;
    totalDec += latDec;

    String status = (original == decrypted) ? "OK" : "FAIL";
    print("Item #$count: $status | Enc: ${latEnc.toStringAsFixed(3)}ms | Dec: ${latDec.toStringAsFixed(3)}ms");

    // Log individually to latency log only (to avoid spamming data log with same repeated tests if run often, 
    // or we can log both. User requested separation. Let's log latency.)
    // User wants "log untuk latenti enkripsinya sama ada log buat data nya apa aja".
    // Batch test is usually for latency, but let's log the fact it happened.
    await logLatency("BATCH_TEST_ITEM", latEnc, info: "Enc Item #$count");
    await logLatency("BATCH_TEST_ITEM", latDec, info: "Dec Item #$count");
  }

  if (count > 0) {
    double avgEnc = totalEnc / count;
    double avgDec = totalDec / count;
    print('\n--- Summary Batch Test ---');
    print('Rata-rata Enkripsi: ${avgEnc.toStringAsFixed(3)} ms');
    print('Rata-rata Dekripsi: ${avgDec.toStringAsFixed(3)} ms');
    
    await logLatency("BATCH_SUMMARY", avgEnc, info: "Average Encryption ($count items)");
    await logLatency("BATCH_SUMMARY", avgDec, info: "Average Decryption ($count items)");
  }
}

Future<void> logData(String type, String input, String output) async {
  final timestamp = DateFormat('yyyy-MM-dd HH:mm:ss').format(DateTime.now());
  final entry = "[$timestamp] [$type]\nIn : $input\nOut: $output\n-------------------------";
  await dataLogFile.writeAsString("$entry\n", mode: FileMode.append);
}

Future<void> logLatency(String type, double ms, {String info = ""}) async {
  final timestamp = DateFormat('yyyy-MM-dd HH:mm:ss').format(DateTime.now());
  String detail = info.isNotEmpty ? " ($info)" : "";
  final entry = "[$timestamp] [$type] Latency: ${ms.toStringAsFixed(3)} ms$detail";
  await latencyLogFile.writeAsString("$entry\n", mode: FileMode.append);
}

Future<void> viewLog(File file, String title) async {
  print('\n--- $title (10 Terakhir) ---');
  if (!await file.exists()) {
    print('File log belum ada.');
    return;
  }
  List<String> lines = await file.readAsLines();
  int start = lines.length > 15 ? lines.length - 15 : 0;
  for (int i = start; i < lines.length; i++) {
    print(lines[i]);
  }
  print('---------------------------------');
}
