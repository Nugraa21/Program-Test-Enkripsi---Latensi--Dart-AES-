import 'dart:convert';
import 'dart:io';
import 'package:intl/intl.dart';
import '../lib/api_encryption.dart';

// =============================================
//  File & Folder Paths
// =============================================
final File keyFile        = File('key.json');
final File jsonInputFile  = File('data.json');
final File dataLogFile    = File('data.log');
final File latencyLogFile = File('latency.log');

// Folder output utama dan subfoldernya
final Directory codeDir      = Directory('code');
final Directory originalDir  = Directory('code/original');
final Directory enkripsiDir  = Directory('code/enkripsi');
final Directory dekripsiDir  = Directory('code/dekripsi');

// =============================================
//  Helpers
// =============================================

/// Pastikan semua folder output sudah ada
Future<void> ensureOutputDirs() async {
  for (var dir in [codeDir, originalDir, enkripsiDir, dekripsiDir]) {
    if (!await dir.exists()) {
      await dir.create(recursive: true);
    }
  }
}

/// Format bytes jadi string yang mudah dibaca
String formatBytes(int bytes) {
  if (bytes < 1024) return '$bytes bytes';
  double kb = bytes / 1024;
  return '${kb.toStringAsFixed(2)} KB ($bytes bytes)';
}

/// Tampilkan perbandingan ukuran file
void printSizeComparison(int originalSize, int enkripsiSize, int dekripsiSize) {
  double ratioEnk = enkripsiSize / originalSize;
  double ratioDek = dekripsiSize / originalSize;

  print('\n┌─────────────────────────────────────────────────┐');
  print('│            PERBANDINGAN UKURAN FILE              │');
  print('├─────────────────────────────────────────────────┤');
  print('│ File Asli      : ${formatBytes(originalSize).padRight(31)}│');
  print('│ File Enkripsi  : ${formatBytes(enkripsiSize).padRight(31)}│');
  print('│ File Dekripsi  : ${formatBytes(dekripsiSize).padRight(31)}│');
  print('├─────────────────────────────────────────────────┤');
  print('│ Rasio Enkripsi : ${ratioEnk.toStringAsFixed(3).padRight(31)}│  (thd asli)');
  print('│ Rasio Dekripsi : ${ratioDek.toStringAsFixed(3).padRight(31)}│  (thd asli)');
  print('├─────────────────────────────────────────────────┤');

  // Verifikasi klaim dosen: dekripsi = 2x ukuran asli
  bool isDekripsiDouble = (ratioDek >= 1.8 && ratioDek <= 2.2);
  String claim = isDekripsiDouble
      ? '✓  Benar! Ukuran dekripsi ~2x ukuran asli'
      : '✗  Tidak persis 2x (rasio = ${ratioDek.toStringAsFixed(3)}x)';
  print('│ Klaim Dosen    : ${claim.padRight(31)}│');
  print('└─────────────────────────────────────────────────┘');

  // Penjelasan
  if (!isDekripsiDouble) 
  {
    print('\n  ℹ  Catatan: Pada AES-CBC, data dekripsi = data asli (sama persis).');
    print('     File "dekripsi" lebih besar hanya jika isinya adalah gabungan');
    print('     plaintext + ciphertext (format tertentu). Secara teori,');
    print('     hasil dekripsi SEHARUSNYA sama dengan asli, bukan 2x lipat.');
    print('     Silakan tanyakan konteks lebih lanjut ke dosen Anda.');
  }
}

/// Log data (input → output) beserta informasi latensi & ukuran
Future<void> logData(
  String type,
  String input,
  String output, {
  double? latencyEncMs,
  double? latencyDecMs,
  int? origSize,
  int? encSize,
  int? decSize,
}) async {
  final ts = DateFormat('yyyy-MM-dd HH:mm:ss').format(DateTime.now());
  final sep = '=' * 50;

  final buffer = StringBuffer();
  buffer.writeln(sep);
  buffer.writeln('[$ts] [$type]');
  buffer.writeln('In  : $input');
  buffer.writeln('Out : $output');

  // Ukuran file
  if (origSize != null) {
    buffer.writeln('─── Ukuran File ───────────────────────────────');
    buffer.writeln('  Asli     : ${formatBytes(origSize)}');
    if (encSize != null) {
      double ratioEnc = encSize / origSize;
      buffer.writeln('  Enkripsi : ${formatBytes(encSize)} (${ratioEnc.toStringAsFixed(3)}x asli)');
    }
    if (decSize != null) {
      double ratioDec = decSize / origSize;
      buffer.writeln('  Dekripsi : ${formatBytes(decSize)} (${ratioDec.toStringAsFixed(3)}x asli)');
    }
  }

  // Latensi & kecepatan
  if (latencyEncMs != null || latencyDecMs != null) {
    buffer.writeln('─── Latensi & Kecepatan ───────────────────────');
    if (latencyEncMs != null && origSize != null) {
      double speedKBs = (origSize / 1024) / (latencyEncMs / 1000.0);
      buffer.writeln('  Enkripsi : ${latencyEncMs.toStringAsFixed(3)} ms  |  ${speedKBs.toStringAsFixed(2)} KB/s');
    } else if (latencyEncMs != null) {
      buffer.writeln('  Enkripsi : ${latencyEncMs.toStringAsFixed(3)} ms');
    }
    if (latencyDecMs != null && encSize != null) {
      double speedKBs = (encSize / 1024) / (latencyDecMs / 1000.0);
      buffer.writeln('  Dekripsi : ${latencyDecMs.toStringAsFixed(3)} ms  |  ${speedKBs.toStringAsFixed(2)} KB/s');
    } else if (latencyDecMs != null) {
      buffer.writeln('  Dekripsi : ${latencyDecMs.toStringAsFixed(3)} ms');
    }
    if (latencyEncMs != null && latencyDecMs != null) {
      buffer.writeln('  Total    : ${(latencyEncMs + latencyDecMs).toStringAsFixed(3)} ms');
    }
  }

  buffer.writeln(sep);
  await dataLogFile.writeAsString(buffer.toString(), mode: FileMode.append);
}

/// Log latensi
Future<void> logLatency(String type, double ms, {String info = ''}) async {
  final ts     = DateFormat('yyyy-MM-dd HH:mm:ss').format(DateTime.now());
  String detail = info.isNotEmpty ? ' ($info)' : '';
  final entry  = '[$ts] [$type] Latency: ${ms.toStringAsFixed(3)} ms$detail';
  await latencyLogFile.writeAsString('$entry\n', mode: FileMode.append);
}

/// Tampilkan Log Data Terakhir (Menu 5) — dengan latensi, kecepatan, & size
Future<void> viewDataLog() async {
  print('\n' + '=' * 54);
  print('          LOG DATA TERAKHIR (5 Entri Terakhir)');
  print('=' * 54);

  if (!await dataLogFile.exists()) {
    print('File data.log belum ada. Jalankan operasi enkripsi/dekripsi terlebih dahulu.');
    print('=' * 54);
    return;
  }

  String raw = await dataLogFile.readAsString();
  // Pisahkan entri berdasarkan separator '='
  List<String> entries = raw.split('=' * 50)
      .map((e) => e.trim())
      .where((e) => e.isNotEmpty)
      .toList();

  // Tampilkan 5 entri terakhir
  int start = entries.length > 5 ? entries.length - 5 : 0;
  List<String> recent = entries.sublist(start);

  for (int i = 0; i < recent.length; i++) {
    print('\n[ Entri ${start + i + 1} dari ${entries.length} ]');
    print('─' * 54);
    // Parse baris-baris dalam entri
    List<String> lines = recent[i].split('\n').where((l) => l.trim().isNotEmpty).toList();
    for (String line in lines) {
      print(line);
    }
    print('─' * 54);
  }

  print('\nTotal entri tersimpan: ${entries.length}');
  print('File log: ${dataLogFile.path}');
  print('=' * 54);
}

/// Tampilkan Log Latensi Terakhir (Menu 4)
Future<void> viewLog(File file, String title) async {
  print('\n--- $title (15 Baris Terakhir) ---');
  if (!await file.exists()) {
    print('File log belum ada.');
    return;
  }
  List<String> lines = await file.readAsLines();
  int start = lines.length > 15 ? lines.length - 15 : 0;
  for (int i = start; i < lines.length; i++) {
    print(lines[i]);
  }
  print('-' * 40);
}

// =============================================
//  MAIN
// =============================================
void main() async {
  // Load Key
  if (!await keyFile.exists()) {
    print('Error: key.json tidak ditemukan!');
    return;
  }
  try {
    String keyContent = await keyFile.readAsString();
    Map<String, dynamic> keyJson = jsonDecode(keyContent);
    ApiEncryption.setKey(keyJson['key']);
    print('✓ Kunci Enkripsi Berhasil Dimuat dari key.json');
  } catch (e) {
    print('Error membaca key.json: $e');
    return;
  }

  // Siapkan folder output
  await ensureOutputDirs();
  print('✓ Folder output siap: code/ (original/ | enkripsi/ | dekripsi/)');

  // Main Menu Loop
  while (true) {
    print('\n=============================================');
    print('     Aplikasi Test Latensi AES (Dart)');
    print('=============================================');
    print('1. Enkripsi Data Manual');
    print('2. Dekripsi Data Manual');
    print('3. Enkripsi data.json (Batch + File Output)');
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
        await viewLog(latencyLogFile, 'Log Latensi');
        break;
      case '5':
        await viewDataLog();
        break;
      case '6':
        print('Keluar program...');
        exit(0);
      default:
        print('Pilihan tidak valid, silakan coba lagi.');
    }
  }
}

// =============================================
//  MENU 1: Enkripsi Manual
// =============================================
Future<void> menuEncryptManual() async {
  stdout.write('\nMasukkan Teks untuk Dienkripsi: ');
  String? text = stdin.readLineSync();
  if (text == null || text.isEmpty) {
    print('Input kosong, dibatalkan.');
    return;
  }

  final sw = Stopwatch()..start();
  String encrypted;
  try {
    encrypted = ApiEncryption.encrypt(text);
  } catch (e) {
    print('Enkripsi Gagal: $e');
    return;
  }
  sw.stop();
  double latency = sw.elapsedMicroseconds / 1000.0;

  // Simpan file
  int originalSize  = text.length;
  int enkripsiSize  = encrypted.length;

  String timestamp = DateFormat('yyyyMMdd_HHmmss').format(DateTime.now());
  File origFile = File('code/original/manual_$timestamp.txt');
  File encFile  = File('code/enkripsi/manual_$timestamp.enc.txt');
  await origFile.writeAsString(text);
  await encFile.writeAsString(encrypted);

  // Tampilan hasil
  int origBytes = await origFile.length();
  int encBytes  = await encFile.length();

  print('\n--- Hasil Enkripsi Manual ---');
  print('Input  : $text');
  print('Output : $encrypted');
  print('Latensi: ${latency.toStringAsFixed(3)} ms');
  print('\n📁 File Tersimpan:');
  print('   Asli     → ${origFile.path}  (${formatBytes(origBytes)})');
  print('   Enkripsi → ${encFile.path}  (${formatBytes(encBytes)})');

  // Ukuran perbandingan (tanpa dekripsi di menu ini)
  double ratioEnk = enkripsiSize / originalSize;
  print('\n   Rasio enkripsi : ${ratioEnk.toStringAsFixed(3)}x ukuran asli');
  print('   Catatan: AES-CBC + Base64 biasanya ~1.5–2x ukuran asli.');

  await logData(
    'ENCRYPT_MANUAL',
    text,
    encrypted,
    latencyEncMs: latency,
    origSize: origBytes,
    encSize: encBytes,
  );
  await logLatency('ENCRYPT_MANUAL', latency);
}

// =============================================
//  MENU 2: Dekripsi Manual
// =============================================
Future<void> menuDecryptManual() async {
  stdout.write('\nMasukkan Ciphertext (Base64) untuk Didekripsi: ');
  String? text = stdin.readLineSync();
  if (text == null || text.isEmpty) {
    print('Input kosong, dibatalkan.');
    return;
  }

  final sw = Stopwatch()..start();
  String decrypted;
  try {
    decrypted = ApiEncryption.decrypt(text);
  } catch (e) {
    print('Dekripsi Gagal (pastikan format Base64 & key benar): $e');
    return;
  }
  sw.stop();
  double latency = sw.elapsedMicroseconds / 1000.0;

  // Simpan file
  String timestamp = DateFormat('yyyyMMdd_HHmmss').format(DateTime.now());
  File encFile  = File('code/enkripsi/manual_dec_input_$timestamp.enc.txt');
  File dekFile  = File('code/dekripsi/manual_$timestamp.txt');
  await encFile.writeAsString(text);
  await dekFile.writeAsString(decrypted);

  int encBytes = await encFile.length();
  int dekBytes = await dekFile.length();

  print('\n--- Hasil Dekripsi Manual ---');
  print('Input (Base64): $text');
  print('Output         : $decrypted');
  print('Latensi        : ${latency.toStringAsFixed(3)} ms');
  print('\n📁 File Tersimpan:');
  print('   Enkripsi → ${encFile.path}  (${formatBytes(encBytes)})');
  print('   Dekripsi → ${dekFile.path}  (${formatBytes(dekBytes)})');

  await logData(
    'DECRYPT_MANUAL',
    text,
    decrypted,
    latencyDecMs: latency,
    encSize: encBytes,
    decSize: dekBytes,
  );
  await logLatency('DECRYPT_MANUAL', latency);
}

// =============================================
//  MENU 3: Batch Test dari data.json
// =============================================
Future<void> menuBatchTest() async {
  if (!await jsonInputFile.exists()) {
    print('File data.json tidak ditemukan. Membuat file baru...');
    await jsonInputFile.writeAsString(jsonEncode(['Test data 1', 'Test data 2']));
  }

  // Baca isi data.json
  String jsonRaw = await jsonInputFile.readAsString();
  List<dynamic> listData = [];
  try {
    listData = jsonDecode(jsonRaw);
  } catch (e) {
    print('Error parsing data.json: $e');
    return;
  }

  // Ukuran file data.json asli
  int jsonFileSize = await jsonInputFile.length();
  print('\n📄 data.json asli: ${formatBytes(jsonFileSize)}');
  print('   Jumlah item: ${listData.length}');

  stdout.write('\nApakah anda ingin menambah data test baru? (y/n): ');
  String? add = stdin.readLineSync();
  if (add != null && add.toLowerCase() == 'y') {
    stdout.write('Masukkan string data baru: ');
    String? newVal = stdin.readLineSync();
    if (newVal != null && newVal.isNotEmpty) {
      listData.add(newVal);
      await jsonInputFile.writeAsString(jsonEncode(listData));
      print('✓ Data berhasil disimpan ke data.json');
      jsonFileSize = await jsonInputFile.length();
    }
  }

  print('\n Memulai Enkripsi data.json...\n');

  // Timestamp sesi ini
  String sessionTs = DateFormat('yyyyMMdd_HHmmss').format(DateTime.now());

  // File output untuk sesi ini
  File origFile = File('code/original/data_json_$sessionTs.json');
  File encFile  = File('code/enkripsi/data_json_$sessionTs.enc.json');
  File dekFile  = File('code/dekripsi/data_json_$sessionTs.dec.json');

  // Simpan file asli (copy data.json)
  String originalContent = await jsonInputFile.readAsString();
  await origFile.writeAsString(originalContent);

  // -- Enkripsi seluruh konten data.json sebagai satu string --
  print('▶ Mengenkripsi seluruh isi data.json...');
  final swEnc = Stopwatch()..start();
  String encryptedContent = ApiEncryption.encrypt(originalContent);
  swEnc.stop();
  double latEnc = swEnc.elapsedMicroseconds / 1000.0;
  await encFile.writeAsString(encryptedContent);

  // -- Dekripsi kembali --
  print('▶ Mendekripsi kembali...');
  final swDec = Stopwatch()..start();
  String decryptedContent = ApiEncryption.decrypt(encryptedContent);
  swDec.stop();
  double latDec = swDec.elapsedMicroseconds / 1000.0;
  await dekFile.writeAsString(decryptedContent);

  // Baca ukuran file yang sudah ditulis
  int origBytes = await origFile.length();
  int encBytes  = await encFile.length();
  int dekBytes  = await dekFile.length();

  // Verifikasi data
  bool isMatch = (originalContent == decryptedContent);

  // ---- Tampilkan hasil ----
  print('\n┌─────────────────────────────────────────────────────┐');
  print('│              HASIL TEST ENKRIPSI data.json           │');
  print('├─────────────────────────────────────────────────────┤');
  print('│ LATENSI                                              │');
  print('│   Enkripsi : ${latEnc.toStringAsFixed(3).padLeft(8)} ms                            │');
  print('│   Dekripsi : ${latDec.toStringAsFixed(3).padLeft(8)} ms                            │');
  print('│   Total    : ${(latEnc + latDec).toStringAsFixed(3).padLeft(8)} ms                            │');
  print('├─────────────────────────────────────────────────────┤');
  print('│ STATUS VERIFIKASI                                    │');
  print('│   Data Cocok? : ${isMatch ? "✓  YA - Dekripsi berhasil sempurna" : "✗  TIDAK - Ada kesalahan dekripsi"}   │');
  print('└─────────────────────────────────────────────────────┘');

  printSizeComparison(origBytes, encBytes, dekBytes);

  print('\n📁 File Output Tersimpan di folder code/:');
  print('   ${origFile.path}');
  print('   └─ Ukuran: ${formatBytes(origBytes)}');
  print('   ${encFile.path}');
  print('   └─ Ukuran: ${formatBytes(encBytes)}');
  print('   ${dekFile.path}');
  print('   └─ Ukuran: ${formatBytes(dekBytes)}');

  // -- Test per-item jika lebih dari 1 item --
  if (listData.length > 1) {
    print('\n--- Test Per-Item (${listData.length} items) ---');
    double totalEncLat = 0;
    double totalDecLat = 0;
    int count = 0;

    for (var item in listData) {
      String original  = item.toString();
      count++;

      final swE = Stopwatch()..start();
      String enc = ApiEncryption.encrypt(original);
      swE.stop();
      double lE = swE.elapsedMicroseconds / 1000.0;
      totalEncLat += lE;

      final swD = Stopwatch()..start();
      String dec = ApiEncryption.decrypt(enc);
      swD.stop();
      double lD = swD.elapsedMicroseconds / 1000.0;
      totalDecLat += lD;

      String status = (original == dec) ? 'OK' : 'FAIL';
      int origSz = utf8.encode(original).length;
      int encSz  = utf8.encode(enc).length;
      int decSz  = utf8.encode(dec).length;

      print('Item #$count [$status]');
      print('  Asli    : ${formatBytes(origSz)} | Enc: ${lE.toStringAsFixed(3)}ms');
      print('  Enkripsi: ${formatBytes(encSz)}');
      print('  Dekripsi: ${formatBytes(decSz)} | Dec: ${lD.toStringAsFixed(3)}ms');

      await logLatency('BATCH_ENC', lE, info: 'Item #$count: $original');
      await logLatency('BATCH_DEC', lD, info: 'Item #$count');
    }

    double avgEnc = totalEncLat / count;
    double avgDec = totalDecLat / count;
    print('\n--- Rata-rata ($count item) ---');
    print('  Rata-rata Enkripsi: ${avgEnc.toStringAsFixed(3)} ms');
    print('  Rata-rata Dekripsi: ${avgDec.toStringAsFixed(3)} ms');

    await logLatency('BATCH_AVG_ENC', avgEnc, info: '$count items');
    await logLatency('BATCH_AVG_DEC', avgDec, info: '$count items');
  }

  // Log utama — satu entri lengkap dengan latensi & size
  await logLatency('JSON_ENCRYPT', latEnc, info: 'data.json full file (${formatBytes(origBytes)})');
  await logLatency('JSON_DECRYPT', latDec, info: 'data.json full file');
  await logData(
    'JSON_BATCH_TEST',
    'file:${origFile.path}',
    'enc:${encFile.path} | dec:${dekFile.path}',
    latencyEncMs: latEnc,
    latencyDecMs: latDec,
    origSize: origBytes,
    encSize: encBytes,
    decSize: dekBytes,
  );

  print('\n✓ Semua log tersimpan di data.log & latency.log');
}
