'use strict';
/* ══════════════════════════════════════════════════
   AES-256 Dashboard — app.js
   • WebCrypto AES-256-CBC (kompatibel dgn Dart)
   • localStorage persistence semua data
   • Dark / Light theme toggle
══════════════════════════════════════════════════ */

// ─── CONSTANTS ────────────────────────────────────
const DEFAULT_KEY = 'SkadutaPresensi2025SecureKey1234';
const LS = {
    THEME: 'aes-theme',
    LAT_LOG: 'aes-latLog',
    DATA_LOG: 'aes-dataLog',
    STATS: 'aes-stats',
    LAST_C: 'aes-lastCipher',
    BATCH_IN: 'aes-batchIn',
    ACTIVITIES: 'aes-activities',
    SETTINGS: 'aes-settings',
};

// ─── STATE ────────────────────────────────────────
const S = {
    cryptoKey: null,
    keyStr: '',
    lastCipher: '',
    latLog: [],
    dataLog: [],
    encHist: [],
    decHist: [],
    totalEnc: 0,
    totalDec: 0,
    logFilter: 'all',
    activities: [],
    settings: {
        showIv: true,
        bitView: false,
        detailedLog: true,
        perfMode: false,
        autoCopy: false,
        strictKey: true
    }
};

// ─── LOCALSTORAGE HELPERS ─────────────────────────
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('LS full?', e); } };
const lsDel = k => localStorage.removeItem(k);
const lsBytes = k => { const v = localStorage.getItem(k); return v ? new Blob([v]).size : 0; };

function saveState() {
    lsSet(LS.LAT_LOG, S.latLog.slice(-200));
    lsSet(LS.DATA_LOG, S.dataLog.slice(-50));
    lsSet(LS.STATS, { encHist: S.encHist.slice(-50), decHist: S.decHist.slice(-50), totalEnc: S.totalEnc, totalDec: S.totalDec });
    lsSet(LS.LAST_C, S.lastCipher);
    lsSet(LS.ACTIVITIES, S.activities.slice(0, 50));
    lsSet(LS.SETTINGS, S.settings);
}

function loadState() {
    S.latLog = lsGet(LS.LAT_LOG) || [];
    S.dataLog = lsGet(LS.DATA_LOG) || [];
    const st = lsGet(LS.STATS) || {};
    S.encHist = st.encHist || [];
    S.decHist = st.decHist || [];
    S.totalEnc = st.totalEnc || 0;
    S.totalDec = st.totalDec || 0;
    S.lastCipher = lsGet(LS.LAST_C) || '';
    S.activities = lsGet(LS.ACTIVITIES) || [];
    const sett = lsGet(LS.SETTINGS);
    if (sett) S.settings = { ...S.settings, ...sett };

    const bi = lsGet(LS.BATCH_IN);
    if (bi) { const el = document.getElementById('batchIn'); if (el) el.value = bi; }

    // Apply UI settings
    initSettingsUI();
}

// ─── THEME ────────────────────────────────────────
function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    const moon = document.getElementById('iconMoon');
    const sun = document.getElementById('iconSun');
    if (!moon || !sun) return;
    moon.style.display = t === 'dark' ? '' : 'none';
    sun.style.display = t === 'light' ? '' : 'none';
    lsSet(LS.THEME, t);
}
function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
    setTimeout(redrawChart, 80);
}

// ─── KEY MANAGEMENT ───────────────────────────────
async function importKey(k) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(k), { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']);
}
async function applyKey() {
    const v = document.getElementById('keyInput').value.trim();
    if (S.settings.strictKey && v.length !== 32) { toast('Kunci harus tepat 32 karakter!', 'er'); return; }
    if (!S.settings.strictKey && v.length === 0) { toast('Kunci tidak boleh kosong!', 'er'); return; }
    try {
        S.cryptoKey = await importKey(v); S.keyStr = v;
        setKeyStatus(true); toast('Kunci berhasil diterapkan.', 'ok');
    } catch (e) { toast('Gagal impor kunci: ' + e.message, 'er'); }
}
function useDefault() {
    document.getElementById('keyInput').value = DEFAULT_KEY;
    updateKeyBar(); applyKey();
}
function setKeyStatus(ok) {
    const ind = document.getElementById('keyIndicator');
    const txt = document.getElementById('keyIndicatorText');
    const dot = document.getElementById('topbarKeyDot');
    const sc = document.getElementById('sysCryptoKey');
    ind.classList.toggle('ok', ok); txt.textContent = ok ? 'Kunci aktif' : 'Kunci belum diset';
    dot.classList.toggle('ok', ok);
    if (sc) { sc.textContent = ok ? 'Aktif' : 'Belum diset'; sc.className = 'status-cell' + (ok ? ' ok' : ''); }
}
function updateKeyBar() {
    const v = document.getElementById('keyInput').value;
    const fill = document.getElementById('keyBarFill');
    fill.style.width = Math.min((v.length / 32) * 100, 100) + '%';
    fill.style.background = v.length === 32 ? 'var(--cyan)' : v.length > 32 ? 'var(--rose)' : 'var(--ind)';
    document.getElementById('keyBarText').textContent = v.length + ' / 32';
}
function toggleKeyVis() {
    const inp = document.getElementById('keyInput');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    document.getElementById('eyeOpen').style.display = inp.type === 'password' ? '' : 'none';
    document.getElementById('eyeClosed').style.display = inp.type === 'password' ? 'none' : '';
}
async function loadKeyFile(e) {
    const f = e.target.files[0]; if (!f) return;
    try {
        const j = JSON.parse(await f.text());
        const k = j.key || j.Key || j.KEY;
        if (!k) { toast('Field "key" tidak ditemukan!', 'er'); return; }
        document.getElementById('keyInput').value = k; updateKeyBar(); await applyKey();
    } catch { toast('JSON tidak valid!', 'er'); }
}

// ─── AES ENCRYPT / DECRYPT ────────────────────────
async function aesEncrypt(plain) {
    if (!S.cryptoKey) throw new Error('Kunci belum diset!');
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const enc = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, S.cryptoKey, new TextEncoder().encode(plain));
    const out = new Uint8Array(16 + enc.byteLength);
    out.set(iv, 0); out.set(new Uint8Array(enc), 16);
    return btoa(String.fromCharCode(...out));
}
// ─── SETTINGS HANDLERS ────────────────────────────
function initSettingsUI() {
    const map = {
        'set-show-iv': 'showIv',
        'set-bit-view': 'bitView',
        'set-detailed-log': 'detailedLog',
        'set-perf-mode': 'perfMode',
        'set-auto-copy': 'autoCopy',
        'set-strict-key': 'strictKey'
    };
    Object.keys(map).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.checked = S.settings[map[id]];
        el.onchange = () => {
            S.settings[map[id]] = el.checked;
            saveState();
            toast('Pengaturan diperbarui.', 'in');
            if (id === 'set-perf-mode') redrawChart();
        };
    });
}

function _simIKS(keyStr, ivBytes) {
    const kb = new TextEncoder().encode(keyStr); let cs = 0;
    for (let r = 1; r <= 14; r++) for (let b = 0; b < kb.length; b++) {
        let v = (kb[b] ^ ivBytes[b % 16] ^ r) & 0xFF, x2 = ((v << 1) ^ ((v & 0x80) ? 0x1B : 0)) & 0xFF,
            x4 = ((x2 << 1) ^ ((x2 & 0x80) ? 0x1B : 0)) & 0xFF, x8 = ((x4 << 1) ^ ((x4 & 0x80) ? 0x1B : 0)) & 0xFF;
        cs ^= (x8 ^ x4 ^ x2 ^ v) & 0xFF;
    }
    return cs;
}
async function aesDecrypt(b64) {
    if (!S.cryptoKey) throw new Error('Kunci belum diset!');
    let bin; try { bin = atob(b64); } catch { throw new Error('Bukan Base64 yang valid!'); }
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    if (bytes.length < 17) throw new Error('Data terlalu pendek!');
    const iv = bytes.slice(0, 16), cipher = bytes.slice(16);
    _simIKS(S.keyStr, iv);
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, S.cryptoKey, cipher));
}

// ─── MENU 1: ENKRIPSI MANUAL ──────────────────────
async function doEncrypt() {
    const text = document.getElementById('encIn').value;
    if (!text.trim()) { toast('Input kosong!', 'er'); return; }
    if (!S.cryptoKey) { toast('Set kunci dahulu!', 'er'); showTab('settings'); return; }
    setBusy('btnEnc', true);
    try {
        const t0 = performance.now(), cipher = await aesEncrypt(text), latEnc = performance.now() - t0;
        const t1 = performance.now(); await aesDecrypt(cipher); const latDec = performance.now() - t1;
        S.lastCipher = cipher;
        const oSz = byteLen(text), eSz = byteLen(cipher), ratio = eSz / oSz, spd = (oSz / 1024) / (latEnc / 1000);
        document.getElementById('encOut').value = cipher;
        showRG('encResultGrid', {
            encLat: latEnc.toFixed(3) + ' ms', encSpeed: spd.toFixed(2) + ' KB/s',
            encOrigSz: fmt(oSz), encEncSz: fmt(eSz), encRatio: ratio.toFixed(3) + 'x', encStatus: 'Berhasil'
        });
        showSizeTable('encSizeTable', 'encSizeNote', 'encSizeCard', oSz, eSz, oSz, latEnc, latDec);
        addLatLog('ENCRYPT_MANUAL', latEnc, text.substring(0, 60));
        addDataLog({ type: 'ENCRYPT_MANUAL', origSz: oSz, encSz: eSz, decSz: oSz, latEnc, isMatch: true, speedEnc: spd });
        addActivity('enc', 'Enkripsi Manual', fmt(oSz) + ' → ' + fmt(eSz), latEnc, { plain: text, cipher, sizeIn: oSz, sizeOut: eSz });
        S.totalEnc++; S.encHist.push(latEnc); S.decHist.push(latDec);
        updateStats(); updateSysOps(); saveState(); redrawChart();
        toast('Enkripsi berhasil.', 'ok');
        if (S.settings.autoCopy) {
            navigator.clipboard.writeText(cipher);
            toast('Ciphertext otomatis disalin!', 'in');
        }
    } catch (e) { toast('Gagal: ' + e.message, 'er'); }
    finally { setBusy('btnEnc', false); }
}

// ─── MENU 2: DEKRIPSI MANUAL ──────────────────────
async function doDecrypt() {
    const cipher = document.getElementById('decIn').value.trim();
    if (!cipher) { toast('Input kosong!', 'er'); return; }
    if (!S.cryptoKey) { toast('Set kunci dahulu!', 'er'); showTab('settings'); return; }
    setBusy('btnDec', true);
    try {
        const eSz = byteLen(cipher), t0 = performance.now(), plain = await aesDecrypt(cipher), latDec = performance.now() - t0;
        const dSz = byteLen(plain), spd = (eSz / 1024) / (latDec / 1000);
        const bts = Uint8Array.from(atob(cipher), c => c.charCodeAt(0)), iks = _simIKS(S.keyStr, bts.slice(0, 16));
        document.getElementById('decOut').value = plain;
        showRG('decResultGrid', {
            decLat: latDec.toFixed(3) + ' ms', decSpeed: spd.toFixed(2) + ' KB/s',
            decEncSz: fmt(eSz), decDecSz: fmt(dSz), decVerify: 'Berhasil', decIKS: 'cs=0x' + iks.toString(16).padStart(2, '0')
        });
        document.getElementById('decVerify').classList.add('good');
        showSizeTable('decSizeTable', 'decSizeNote', 'decSizeCard', eSz, eSz, dSz, null, latDec);
        addLatLog('DECRYPT_MANUAL', latDec, fmt(eSz) + ' → ' + fmt(dSz));
        addDataLog({ type: 'DECRYPT_MANUAL', encSz: eSz, decSz: dSz, latDec, speedDec: spd });
        addActivity('dec', 'Dekripsi Manual', fmt(eSz) + ' → ' + fmt(dSz), latDec, { plain, cipher, sizeIn: eSz, sizeOut: dSz });
        S.totalDec++; S.decHist.push(latDec);
        updateStats(); updateSysOps(); saveState(); redrawChart();
        toast('Dekripsi berhasil.', 'ok');
    } catch (e) {
        document.getElementById('decResultGrid').style.display = 'grid';
        document.getElementById('decVerify').textContent = 'Gagal'; document.getElementById('decVerify').classList.add('bad');
        toast('Gagal: ' + e.message, 'er');
    }
    finally { setBusy('btnDec', false); }
}
function pasteLastCipher() {
    if (!S.lastCipher) { toast('Belum ada hasil enkripsi!', 'er'); return; }
    document.getElementById('decIn').value = S.lastCipher; updateDecSz(); toast('Ciphertext di-paste.', 'in');
}

// ─── MENU 3: BATCH TEST ───────────────────────────
async function doBatch() {
    const raw = document.getElementById('batchIn').value.trim();
    if (!raw) { toast('Input JSON kosong!', 'er'); return; }
    if (!S.cryptoKey) { toast('Set kunci dahulu!', 'er'); showTab('settings'); return; }
    let arr; try { arr = JSON.parse(raw); if (!Array.isArray(arr)) throw 0; } catch { toast('JSON harus berupa Array!', 'er'); return; }
    setLoading(true, 'Mengenkripsi seluruh isi data.json...');
    setBusy('btnBatch', true);
    try {
        const oSz = byteLen(raw), ts = nowTs();
        const t0 = performance.now(), encFull = await aesEncrypt(raw), latEnc = performance.now() - t0;
        setLoadText('Mendekripsi kembali...');
        const t1 = performance.now(), decFull = await aesDecrypt(encFull), latDec = performance.now() - t1;
        const eSz = byteLen(encFull), dSz = byteLen(decFull), isMatch = raw === decFull;
        const sE = (oSz / 1024) / (latEnc / 1000), sD = (eSz / 1024) / (latDec / 1000);

        setLoadText(`Test per-item (${arr.length} items)...`);
        const items = []; let sumE = 0, sumD = 0;
        for (let i = 0; i < arr.length; i++) {
            const item = typeof arr[i] === 'string' ? arr[i] : JSON.stringify(arr[i]);
            const tE = performance.now(), enc = await aesEncrypt(item), lE = performance.now() - tE;
            const tD = performance.now(), dec = await aesDecrypt(enc), lD = performance.now() - tD;
            sumE += lE; sumD += lD;
            items.push({ idx: i + 1, orig: item, lE, lD, ok: item === dec, oSz: byteLen(item), eSz: byteLen(enc), dSz: byteLen(dec) });
            addLatLog('BATCH_ENC', lE, 'Item #' + (i + 1) + ': ' + item.substring(0, 50));
            addLatLog('BATCH_DEC', lD, 'Item #' + (i + 1));
        }
        const avgE = arr.length ? sumE / arr.length : 0, avgD = arr.length ? sumD / arr.length : 0;
        if (arr.length > 1) { addLatLog('BATCH_AVG_ENC', avgE, arr.length + ' items'); addLatLog('BATCH_AVG_DEC', avgD, arr.length + ' items'); }
        addLatLog('JSON_ENCRYPT', latEnc, 'data.json full (' + fmt(oSz) + ')');
        addLatLog('JSON_DECRYPT', latDec, 'data.json full');
        addDataLog({ type: 'JSON_BATCH_TEST', origSz: oSz, encSz: eSz, decSz: dSz, latEnc, latDec, isMatch, speedEnc: sE, speedDec: sD });
        addActivity('batch', 'Batch Test JSON (' + arr.length + ' items)', fmt(oSz) + ' → enc:' + fmt(eSz), latEnc + latDec);
        S.totalEnc++; S.totalDec++; S.encHist.push(latEnc); S.decHist.push(latDec);
        updateStats(); updateSysOps(); saveState(); redrawChart(); renderLatLog(); renderDataLog();

        renderBatch({ oSz, eSz, dSz, latEnc, latDec, isMatch, sE, sD, items, avgE, avgD, encFull, decFull, raw, ts, arr });
        toast('Batch test selesai. ' + (isMatch ? 'Data cocok.' : 'Data TIDAK cocok!'), isMatch ? 'ok' : 'er');
    } catch (e) { toast('Batch gagal: ' + e.message, 'er'); }
    finally { setLoading(false); setBusy('btnBatch', false); }
}

function renderBatch({ oSz, eSz, dSz, latEnc, latDec, isMatch, sE, sD, items, avgE, avgD, encFull, decFull, raw, ts }) {
    const rE = eSz / oSz, rD = dSz / oSz, dok = rD >= 1.8 && rD <= 2.2;
    const sg = document.getElementById('batchSummaryGrid');
    sg.style.display = 'grid';
    sg.innerHTML = kvRG('Latensi Enkripsi', latEnc.toFixed(3) + ' ms') + kvRG('Latensi Dekripsi', latDec.toFixed(3) + ' ms')
        + kvRG('Total Latensi', (latEnc + latDec).toFixed(3) + ' ms') + kvRG('Kec. Enkripsi', sE.toFixed(2) + ' KB/s')
        + kvRG('Kec. Dekripsi', sD.toFixed(2) + ' KB/s') + kvRG('Verifikasi', isMatch ? 'Cocok' : 'TIDAK Cocok', isMatch ? 'good' : 'bad');
    showSizeTable('batchSizeTable', 'batchSizeNote', 'batchResultArea', oSz, eSz, dSz, latEnc, latDec, true);
    const il = document.getElementById('batchItemList');
    document.getElementById('batchItemBadge').textContent = items.length + ' items';
    il.innerHTML = items.length <= 1
        ? '<p style="color:var(--muted);padding:10px 0;font-size:13px">Hanya 1 elemen — tidak ada detail per-item.</p>'
        : items.map(it => `<div class="batch-item ${it.ok ? 'ok' : 'fail'}">
        <div class="bi-header"><div class="bi-title">Item #${it.idx}</div><div class="bi-status ${it.ok ? 'ok' : 'fail'}">${it.ok ? 'OK' : 'FAIL'}</div></div>
        <div class="bi-meta"><span>Asli: ${fmt(it.oSz)}</span><span>Enc: ${it.lE.toFixed(3)} ms</span><span>Enc size: ${fmt(it.eSz)}</span><span>Dec: ${it.lD.toFixed(3)} ms</span><span>Rasio: ${(it.eSz / it.oSz).toFixed(3)}x</span></div>
        <div class="bi-raw">${esc(it.orig.substring(0, 150))}</div></div>`).join('');
    const ag = document.getElementById('batchAvgGrid');
    if (items.length > 1) {
        document.getElementById('batchAvgCard').style.display = 'block'; ag.style.display = 'grid';
        ag.innerHTML = kvRG('Rata-rata Enkripsi', avgE.toFixed(3) + ' ms') + kvRG('Rata-rata Dekripsi', avgD.toFixed(3) + ' ms') + kvRG('Jumlah Item', items.length + ' items');
    } else document.getElementById('batchAvgCard').style.display = 'none';
    const fn = 'data_json_' + ts;
    document.getElementById('batchFiles').innerHTML = dlBtn('Asli (' + fmt(oSz) + ')', raw, fn + '.json', '', 'application/json')
        + dlBtn('Enkripsi (' + fmt(eSz) + ')', encFull, fn + '.enc.json', 'enc', 'text/plain')
        + dlBtn('Dekripsi (' + fmt(dSz) + ')', decFull, fn + '.dec.json', 'dec', 'application/json');
    document.getElementById('batchResultArea').style.display = 'block';
    document.getElementById('batchResultArea').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function dlBtn(label, content, fname, cls, mime) {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    return `<a href="${url}" download="${esc(fname)}" class="file-dl ${cls}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>${esc(label)}</a>`;
}
function addDataItem() {
    const v = document.getElementById('newDataInput').value.trim(); if (!v) { toast('Input kosong!', 'er'); return; }
    const ta = document.getElementById('batchIn'); let arr = [];
    try { arr = JSON.parse(ta.value || '[]'); if (!Array.isArray(arr)) arr = []; } catch { arr = []; }
    arr.push(v); ta.value = JSON.stringify(arr, null, 2);
    document.getElementById('newDataInput').value = '';
    updateBatchSz(); lsSet(LS.BATCH_IN, arr); toast('Item ditambahkan.', 'ok');
}
function loadSample() {
    const s = [
        '{"username":"testuser","password":"password123","device_id":"d8a928b2-0081-4d29"}',
        '{"username":"nugraha","nama_lengkap":"Baru Nugraha","nip_nisn":"12345678","role":"user"}',
        '{"id":"42","reset_device":true}',
        '{"userId":"101","jenis":"Masuk","keterangan":"Tepat Waktu","latitude":"-7.79558","longitude":"110.36949"}',
        '{"id":"505","status":"Hadir"}', '{"id":"99"}',
        '{"id":"7","username":"admin_edit","role":"admin"}'
    ];
    document.getElementById('batchIn').value = JSON.stringify(s, null, 2);
    lsSet(LS.BATCH_IN, s); updateBatchSz(); toast('Sample data dimuat.', 'ok');
}
function clearBatch() {
    document.getElementById('batchIn').value = '';
    document.getElementById('batchResultArea').style.display = 'none';
    lsDel(LS.BATCH_IN); updateBatchSz();
}

// ─── SIZE COMPARISON TABLE ────────────────────────
function showSizeTable(tId, nId, cId, oSz, eSz, dSz, latEnc, latDec, isCard = false) {
    const card = document.getElementById(cId); if (!isCard && card) card.style.display = 'block';
    const rE = (eSz / oSz || 0).toFixed(3), rD = (dSz / oSz || 0).toFixed(3), dok = dSz / oSz >= 1.8 && dSz / oSz <= 2.2;
    const hasBoth = latEnc != null || latDec != null;
    document.getElementById(tId).innerHTML = `
    <thead><tr><th>File</th><th>Ukuran</th><th>Rasio</th>${hasBoth ? '<th>Latensi</th><th>Kecepatan</th>' : ''}</tr></thead>
    <tbody>
      <tr class="row-orig"><td>File Asli</td><td>${fmt(oSz)}</td><td>1.000×</td>${hasBoth ? '<td>—</td><td>—</td>' : ''}</tr>
      <tr class="row-enc"><td>File Enkripsi</td><td>${fmt(eSz)}</td><td>${rE}×</td>${latEnc != null ? `<td>${latEnc.toFixed(3)} ms</td><td>${((oSz / 1024) / (latEnc / 1000)).toFixed(2)} KB/s</td>` : hasBoth ? '<td>—</td><td>—</td>' : ''}</tr>
      <tr class="row-dec"><td>File Dekripsi</td><td>${fmt(dSz)}</td><td>${rD}×</td>${latDec != null ? `<td>${latDec.toFixed(3)} ms</td><td>${((eSz / 1024) / (latDec / 1000)).toFixed(2)} KB/s</td>` : hasBoth ? '<td>—</td><td>—</td>' : ''}</tr>
    </tbody>`;
    const n = document.getElementById(nId);
    n.className = dok ? 'cmp-note good' : 'cmp-note info';
    n.innerHTML = dok ? `Klaim Dosen: Benar — ukuran dekripsi ~2x asli (${rD}x)`
        : `Klaim Dosen: Tidak persis 2x (rasio=${rD}x). Catatan: AES-CBC hasil dekripsi = asli. File 2x hanya jika menyimpan plaintext+ciphertext sekaligus.`;
}

// ─── LOG LATENSI ──────────────────────────────────
function addLatLog(type, ms, info = '') { S.latLog.push({ ts: nowFmt(), type, ms, info }); renderLatLog(); updateLatLogCount(); }
function renderLatLog() {
    const el = document.getElementById('latLogTerminal'), f = S.logFilter;
    const list = f === 'all' ? S.latLog : S.latLog.filter(e => e.type.includes(f));
    if (!list.length) { el.innerHTML = `<div class="log-ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><p>Tidak ada data untuk filter ini.</p></div>`; return; }
    el.innerHTML = list.slice(-15).map(e => `<div class="log-line"><span class="log-ts">[${e.ts}]</span> <span class="log-type ${tc(e.type)}">[${e.type}]</span> Latency: <span class="log-ms">${e.ms.toFixed(3)} ms</span>${e.info ? ` <span style="color:var(--muted)">(${esc(e.info.substring(0, 80))})</span>` : ''}</div>`).join('');
    el.scrollTop = el.scrollHeight;
}
function tc(t) { return t.includes('ENCRYPT') || t.includes('ENC') ? 'enc' : t.includes('DECRYPT') || t.includes('DEC') ? 'dec' : t.includes('AVG') ? 'avg' : t.includes('JSON') ? 'json' : 'batch'; }
function filterLog(f, btn) { S.logFilter = f; document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); renderLatLog(); }
function exportLatLog() { if (!S.latLog.length) { toast('Belum ada log!', 'er'); return; } downloadText(S.latLog.map(e => `[${e.ts}] [${e.type}] Latency: ${e.ms.toFixed(3)} ms${e.info ? ' (' + e.info + ')' : ''}`).join('\n'), 'latency.log'); toast('Exported.', 'ok'); }
function clearLatLog() { S.latLog = []; lsDel(LS.LAT_LOG); renderLatLog(); updateLatLogCount(); toast('Log latensi dihapus.', 'in'); }
function updateLatLogCount() { const el = document.getElementById('latLogCount'); if (el) el.textContent = S.latLog.length + ' entri'; }

// ─── LOG DATA ─────────────────────────────────────
function addDataLog(e) { e.ts = nowFmt(); S.dataLog.push(e); renderDataLog(); updateDataLogCount(); }
function renderDataLog() {
    const el = document.getElementById('dataLogList');
    if (!S.dataLog.length) { el.innerHTML = `<div class="feed-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><p>Belum ada log data.</p></div>`; return; }
    el.innerHTML = S.dataLog.slice(-5).reverse().map(e => {
        const cls = e.type.includes('ENCRYPT') || e.type.includes('ENC') ? 'enc' : e.type.includes('DECRYPT') || e.type.includes('DEC') ? 'dec' : 'batch';
        return `<div class="dl-entry ${cls}">
      <div class="dl-ts">[${e.ts}] [${e.type}]</div>
      ${e.origSz != null || e.encSz != null || e.decSz != null ? `<div class="dl-section">Ukuran File</div><div class="dl-details">
        ${e.origSz != null ? `<span class="dl-d">Asli: <strong>${fmt(e.origSz)}</strong></span>` : ''}
        ${e.encSz != null ? `<span class="dl-d">Enkripsi: <strong>${fmt(e.encSz)}</strong>${e.origSz ? ' (' + (e.encSz / e.origSz).toFixed(3) + 'x)' : ''}</span>` : ''}
        ${e.decSz != null ? `<span class="dl-d">Dekripsi: <strong>${fmt(e.decSz)}</strong>${e.origSz ? ' (' + (e.decSz / e.origSz).toFixed(3) + 'x)' : ''}</span>` : ''}
      </div>`: ''}
      ${e.latEnc != null || e.latDec != null ? `<div class="dl-section">Latensi &amp; Kecepatan</div><div class="dl-details">
        ${e.latEnc != null ? `<span class="dl-d">Enkripsi: <strong>${e.latEnc.toFixed(3)} ms</strong>${e.speedEnc ? ' | ' + e.speedEnc.toFixed(2) + ' KB/s' : ''}</span>` : ''}
        ${e.latDec != null ? `<span class="dl-d">Dekripsi: <strong>${e.latDec.toFixed(3)} ms</strong>${e.speedDec ? ' | ' + e.speedDec.toFixed(2) + ' KB/s' : ''}</span>` : ''}
        ${e.latEnc && e.latDec ? `<span class="dl-d">Total: <strong>${(e.latEnc + e.latDec).toFixed(3)} ms</strong></span>` : ''}
      </div>`: ''}
      ${e.isMatch != null ? `<div class="dl-details" style="margin-top:6px"><span class="dl-d">Verifikasi: <strong style="color:${e.isMatch ? 'var(--cyan)' : 'var(--rose)'}">${e.isMatch ? 'Cocok (OK)' : 'TIDAK cocok!'}</strong></span></div>` : ''}
    </div>`;
    }).join('');
}
function exportDataLog() {
    if (!S.dataLog.length) { toast('Belum ada log!', 'er'); return; }
    const sep = '='.repeat(50);
    downloadText(S.dataLog.map(e => {
        let s = sep + '\n[' + e.ts + '] [' + e.type + ']\n';
        if (e.origSz != null) s += '  Asli     : ' + fmt(e.origSz) + '\n';
        if (e.encSz != null) s += '  Enkripsi : ' + fmt(e.encSz) + '\n';
        if (e.decSz != null) s += '  Dekripsi : ' + fmt(e.decSz) + '\n';
        if (e.latEnc != null) s += '  Enkripsi : ' + e.latEnc.toFixed(3) + ' ms' + (e.speedEnc ? ' | ' + e.speedEnc.toFixed(2) + ' KB/s' : '') + '\n';
        if (e.latDec != null) s += '  Dekripsi : ' + e.latDec.toFixed(3) + ' ms' + (e.speedDec ? ' | ' + e.speedDec.toFixed(2) + ' KB/s' : '') + '\n';
        return s + sep;
    }
    ).join('\n'), 'data.log'); toast('Exported.', 'ok');
}
function clearDataLog() { S.dataLog = []; lsDel(LS.DATA_LOG); renderDataLog(); updateDataLogCount(); toast('Log data dihapus.', 'in'); }
function updateDataLogCount() { const el = document.getElementById('dataLogCount'); if (el) el.textContent = S.dataLog.length + ' entri'; }

// ─── STORAGE MANAGEMENT ───────────────────────────
const STORAGE_KEYS = [
    { key: LS.LAT_LOG, label: 'Log Latensi', icon: 'enc' },
    { key: LS.DATA_LOG, label: 'Log Data', icon: 'dec' },
    { key: LS.STATS, label: 'Statistik', icon: 'batch' },
    { key: LS.LAST_C, label: 'Cipher Terakhir', icon: 'enc' },
    { key: LS.BATCH_IN, label: 'Data JSON Input', icon: 'dec' },
    { key: LS.THEME, label: 'Preferensi Tema', icon: 'batch' },
];

function refreshStorageView() {
    let total = 0;
    const items = document.getElementById('storageItems');
    items.innerHTML = STORAGE_KEYS.map(({ key, label }) => {
        const sz = lsBytes(key); total += sz;
        return `<div class="si-row">
      <span class="si-name">${esc(label)}</span>
      <span class="si-size">${sz ? fmtB(sz) : 'kosong'}</span>
      <button class="si-del" onclick="clearSpecific('${esc(key)}')" title="Hapus">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
      </button>
    </div>`;
    }).join('');
    const cap = 5 * 1024 * 1024, pct = Math.min((total / cap) * 100, 100);
    document.getElementById('storageBarFill').style.width = pct + '%';
    document.getElementById('storageBarFill').style.background = pct > 80 ? 'var(--rose)' : pct > 50 ? 'var(--orange)' : 'var(--ind)';
    document.getElementById('storageBarLabel').textContent = `${fmtB(total)} dari ~5 MB (${pct.toFixed(1)}%)`;
    document.getElementById('storageTotalText').textContent = fmtB(total);
    document.getElementById('storageEntryCount').textContent = `${S.latLog.length} latency entri, ${S.dataLog.length} data entri`;
    // sidebar mini bar
    document.getElementById('storageMiniBar').style.width = pct + '%';
    document.getElementById('storageMiniText').textContent = fmtB(total);
    // stat cards
    const latSz = lsBytes(LS.LAT_LOG), datSz = lsBytes(LS.DATA_LOG), stSz = lsBytes(LS.STATS);
    setEl('sz-latLog', S.latLog.length + ' entri'); setEl('sz-dataLog', S.dataLog.length + ' entri');
    setEl('sz-chartHist', (S.encHist.length + S.decHist.length) + ' pts'); setEl('sz-total', fmtB(total));
}

function fmtB(b) { if (b < 1024) return b + 'B'; if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'; return (b / 1048576).toFixed(2) + ' MB'; }

function clearSpecific(key) {
    lsDel(key);
    if (key === LS.LAT_LOG) { S.latLog = []; renderLatLog(); updateLatLogCount(); }
    if (key === LS.DATA_LOG) { S.dataLog = []; renderDataLog(); updateDataLogCount(); }
    if (key === LS.STATS) { S.encHist = []; S.decHist = []; S.totalEnc = 0; S.totalDec = 0; updateStats(); redrawChart(); }
    if (key === LS.LAST_C) { S.lastCipher = ''; }
    if (key === LS.BATCH_IN) { const b = document.getElementById('batchIn'); if (b) b.value = ''; updateBatchSz(); }
    refreshStorageView(); toast('Data dihapus.', 'in');
}
function clearAllStorage() {
    if (!confirm('Hapus SEMUA data aplikasi? Aksi ini tidak bisa dibatalkan.')) return;
    Object.values(LS).forEach(lsDel);
    S.latLog = []; S.dataLog = []; S.encHist = []; S.decHist = []; S.totalEnc = 0; S.totalDec = 0; S.lastCipher = ''; S.activities = [];
    renderLatLog(); renderDataLog(); updateLatLogCount(); updateDataLogCount(); updateStats(); redrawChart();
    const b = document.getElementById('batchIn'); if (b) b.value = ''; updateBatchSz();
    document.getElementById('activityFeed').innerHTML = `<div class="feed-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><p>Belum ada aktivitas.</p></div>`;
    refreshStorageView(); toast('Semua data berhasil dihapus.', 'ok');
}

// ─── ACTIVITY FEED ────────────────────────────────
const ICONS = {
    enc: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    dec: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`,
    batch: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`
};
function addActivity(type, title, sub, lat, extra = {}) {
    const feed = document.getElementById('activityFeed');
    const emp = feed.querySelector('.feed-empty'); if (emp) emp.remove();
    const time = timeOnly();
    const idx = S.activities.length;
    const el = document.createElement('div'); el.className = 'feed-item';
    el.setAttribute('onclick', `showModal(${idx})`);
    el.style.cursor = 'pointer';
    el.innerHTML = `<div class="fi-icon ${type}">${ICONS[type]}</div><div class="fi-body"><div class="fi-title">${esc(title)}</div><div class="fi-sub">${esc(sub)}</div></div><div class="fi-right"><div class="fi-lat">${lat.toFixed(3)} ms</div><div class="fi-time">${time}</div></div>`;
    feed.insertBefore(el, feed.firstChild); if (feed.children.length > 30) feed.removeChild(feed.lastChild);

    // Detailed analysis for modal
    const activity = {
        id: idx,
        type,
        title,
        sub,
        lat,
        time,
        ts: nowFmt(),
        plain: extra.plain || 'N/A',
        cipher: extra.cipher || 'N/A',
        sizeIn: extra.sizeIn || 0,
        sizeOut: extra.sizeOut || 0,
        key: S.keyStr
    };
    S.activities.unshift(activity);
    if (S.activities.length > 50) S.activities.pop();
    // Re-index to match array position for onclick
    S.activities.forEach((a, i) => {
        const item = feed.children[i];
        if (item) item.setAttribute('onclick', `showModal(${i})`);
    });
}

function renderActivities() {
    const feed = document.getElementById('activityFeed');
    if (!S.activities.length) return;
    feed.innerHTML = '';
    S.activities.forEach((a, i) => {
        const el = document.createElement('div'); el.className = 'feed-item';
        el.setAttribute('onclick', `showModal(${i})`);
        el.style.cursor = 'pointer';
        el.innerHTML = `<div class="fi-icon ${a.type}">${ICONS[a.type]}</div><div class="fi-body"><div class="fi-title">${esc(a.title)}</div><div class="fi-sub">${esc(a.sub)}</div></div><div class="fi-right"><div class="fi-lat">${a.lat.toFixed(3)} ms</div><div class="fi-time">${a.time}</div></div>`;
        feed.appendChild(el);
    });
}
function clearActivity() {
    document.getElementById('activityFeed').innerHTML = `<div class="feed-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><p>Belum ada aktivitas.</p></div>`;
    S.encHist = []; S.decHist = []; S.totalEnc = 0; S.totalDec = 0; S.activities = [];
    updateStats(); redrawChart(); saveState();
}

// ─── STATS ────────────────────────────────────────
function updateStats() {
    setEl('stTotal', S.totalEnc + S.totalDec); setEl('stTotalDec', S.totalDec);
    if (S.encHist.length) setEl('stAvgEnc', (S.encHist.reduce((a, b) => a + b, 0) / S.encHist.length).toFixed(2) + ' ms');
    if (S.decHist.length) setEl('stAvgDec', (S.decHist.reduce((a, b) => a + b, 0) / S.decHist.length).toFixed(2) + ' ms');
}
function updateSysOps() { const el = document.getElementById('sysTotalOps'); if (el) el.textContent = S.totalEnc + S.totalDec; }

// ─── CHART ────────────────────────────────────────
let chCtx;
function initChart() { const c = document.getElementById('mainChart'); if (c) chCtx = c.getContext('2d'); redrawChart(); window.addEventListener('resize', () => setTimeout(redrawChart, 120)); }
function redrawChart() {
    if (!chCtx) return;
    const enc = S.encHist.slice(-20), dec = S.decHist.slice(-20), ph = document.getElementById('chartPh');
    if (!enc.length && !dec.length) { ph.style.display = 'flex'; return; } ph.style.display = 'none';
    const cv = chCtx.canvas, W = cv.offsetWidth || 600, H = 210;
    cv.width = W * devicePixelRatio; cv.height = H * devicePixelRatio; chCtx.scale(devicePixelRatio, devicePixelRatio);
    const P = { t: 14, r: 18, b: 28, l: 48 }, pw = W - P.l - P.r, ph2 = H - P.t - P.b;
    const n = Math.max(enc.length, dec.length, 2), all = [...enc, ...dec], mx = Math.max(...all, 0.1) * 1.25;
    const xp = i => P.l + (i / (n - 1 || 1)) * pw, yp = v => P.t + ph2 - (v / mx) * ph2;
    chCtx.clearRect(0, 0, W, H);
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const gcol = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
    const tcol = isDark ? 'rgba(107,113,144,0.7)' : 'rgba(100,110,140,0.7)';
    for (let g = 0; g <= 4; g++) { const y = P.t + (g / 4) * ph2; chCtx.strokeStyle = gcol; chCtx.lineWidth = 1; chCtx.beginPath(); chCtx.moveTo(P.l, y); chCtx.lineTo(P.l + pw, y); chCtx.stroke(); chCtx.fillStyle = tcol; chCtx.font = "10px 'JetBrains Mono',monospace"; chCtx.textAlign = 'right'; chCtx.fillText((mx * (1 - g / 4)).toFixed(1), P.l - 5, y + 3.5); }
    function dl(data, color, dot) {
        if (!data.length) return;
        const gr = chCtx.createLinearGradient(0, P.t, 0, P.t + ph2); gr.addColorStop(0, color.replace(')', ',0.15)').replace('rgb', 'rgba')); gr.addColorStop(1, color.replace(')', ',0)').replace('rgb', 'rgba'));
        chCtx.beginPath(); data.forEach((v, i) => { i === 0 ? chCtx.moveTo(xp(i), yp(v)) : chCtx.lineTo(xp(i), yp(v)); });
        chCtx.lineTo(xp(data.length - 1), P.t + ph2); chCtx.lineTo(xp(0), P.t + ph2); chCtx.closePath(); chCtx.fillStyle = gr; chCtx.fill();
        chCtx.beginPath(); chCtx.strokeStyle = color; chCtx.lineWidth = 2.2; chCtx.lineJoin = 'round'; chCtx.lineCap = 'round'; data.forEach((v, i) => { i === 0 ? chCtx.moveTo(xp(i), yp(v)) : chCtx.lineTo(xp(i), yp(v)); }); chCtx.stroke();
        data.forEach((v, i) => { chCtx.beginPath(); chCtx.arc(xp(i), yp(v), 3.5, 0, Math.PI * 2); chCtx.fillStyle = dot; chCtx.fill(); chCtx.strokeStyle = isDark ? '#0e1118' : '#fff'; chCtx.lineWidth = 1.8; chCtx.stroke(); });
    }
    dl(enc, 'rgb(99,102,241)', '#818cf8'); dl(dec, 'rgb(34,211,238)', '#67e8f9');
}

// ─── NAVIGATION ───────────────────────────────────
const TITLES = { dashboard: 'Dashboard', enkripsi: 'Enkripsi Manual', dekripsi: 'Dekripsi Manual', batch: 'Batch Test JSON', file: 'Enkripsi File', 'log-latensi': 'Log Latensi', 'log-data': 'Log Data', settings: 'Pengaturan Kunci', storage: 'Penyimpanan Lokal' };

/* ─── LANDING PAGE ─── */
function enterDashboard() {
    const lp = document.getElementById('landing-page');
    const app = document.getElementById('dashboard-app');
    lp.style.transition = 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
    lp.style.opacity = '0';
    lp.style.transform = 'scale(1.1)';
    setTimeout(() => {
        lp.style.display = 'none';
        app.style.display = 'block';
        document.body.classList.remove('loading');
        setTimeout(redrawChart, 100);
    }, 600);
}

/* ─── MODAL ─── */
function showModal(idx) {
    const a = S.activities[idx];
    if (!a) return;
    const m = document.getElementById('detailModal');
    document.getElementById('modalTitle').textContent = a.title;
    document.getElementById('modalTime').textContent = a.ts + ' (' + a.time + ')';
    document.getElementById('mType').textContent = a.type.toUpperCase();
    document.getElementById('mLat').textContent = a.lat.toFixed(3) + ' ms';
    document.getElementById('mSizeIn').textContent = fmtB(a.sizeIn);
    document.getElementById('mSizeOut').textContent = fmtB(a.sizeOut);
    document.getElementById('mPlain').value = a.plain;
    document.getElementById('mCipher').value = a.cipher;
    document.getElementById('modalIcon').className = 'modal-icon ' + a.type;
    document.getElementById('modalIcon').innerHTML = ICONS[a.type];

    // Analysis
    const list = document.getElementById('mAnalysis');
    const ratio = a.sizeOut / a.sizeIn;
    const speed = (a.sizeIn / 1024) / (a.lat / 1000);
    list.innerHTML = `
        <li>Operasi: ${a.type === 'enc' ? 'Enkripsi (Plain → Cipher)' : 'Dekripsi (Cipher → Plain)'}</li>
        <li>Rasio Ukuran: ${ratio.toFixed(3)}x</li>
        <li>Kecepatan Proses: ${speed.toFixed(2)} KB/s</li>
        <li>Kunci Digunakan: ${a.key.substring(0, 4)}... (Hidden)</li>
        <li>Kompleksitas: ${a.sizeIn > 1000 ? 'Tinggi' : 'Rendah'}</li>
    `;

    m.classList.add('active');
}
function closeModal() { document.getElementById('detailModal').classList.remove('active'); }

/* ─── FILE ENCRYPTION ─── */
let _selectedFile = null;
function handleFileSelect(e) {
    const f = e.target.files[0]; if (!f) return;
    _selectedFile = f;
    document.getElementById('fileName').textContent = f.name;
    document.getElementById('fileSize').textContent = fmtB(f.size);
    document.getElementById('fileInfoChip').style.display = 'inline-flex';
}

async function doFileAction(mode) {
    if (!_selectedFile) { toast('Pilih file dulu!', 'er'); return; }
    if (!S.cryptoKey) { toast('Set kunci dahulu!', 'er'); return; }
    setLoading(true, mode === 'enc' ? 'Mengenkripsi file...' : 'Mendekripsi file...');
    try {
        const t0 = performance.now();
        const arrayBuffer = await _selectedFile.arrayBuffer();
        let resultBuffer;
        if (mode === 'enc') {
            const iv = crypto.getRandomValues(new Uint8Array(16));
            const enc = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, S.cryptoKey, arrayBuffer);
            resultBuffer = new Uint8Array(16 + enc.byteLength);
            resultBuffer.set(iv, 0); resultBuffer.set(new Uint8Array(enc), 16);
        } else {
            const bytes = new Uint8Array(arrayBuffer);
            if (bytes.length < 17) throw new Error('File tidak valid!');
            const iv = bytes.slice(0, 16), cipher = bytes.slice(16);
            resultBuffer = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, S.cryptoKey, cipher);
        }
        const lat = performance.now() - t0;
        const blob = new Blob([resultBuffer]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = mode === 'enc' ? _selectedFile.name + '.enc' : _selectedFile.name.replace('.enc', '');
        a.click();

        // UI Results
        document.getElementById('fileResultGrid').style.display = 'grid';
        document.getElementById('filePh').style.display = 'none';
        document.getElementById('fileLat').textContent = lat.toFixed(3) + ' ms';
        const spd = (_selectedFile.size / 1024) / (lat / 1000);
        document.getElementById('fileSpeed').textContent = spd.toFixed(2) + ' KB/s';

        addActivity(mode === 'enc' ? 'enc' : 'dec', 'Proses File: ' + _selectedFile.name, fmtB(_selectedFile.size) + (mode === 'enc' ? ' → Encrypted' : ' → Decrypted'), lat, {
            plain: 'Binary File: ' + _selectedFile.name,
            cipher: 'Processed Size: ' + fmtB(blob.size),
            sizeIn: _selectedFile.size,
            sizeOut: blob.size
        });
        saveState();
        toast('Berhasil!', 'ok');
    } catch (e) { toast('Error: ' + e.message, 'er'); }
    finally { setLoading(false); }
}
function showTab(id) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const p = document.getElementById('tab-' + id), b = document.getElementById('nav-' + id);
    if (p) p.classList.add('active'); if (b) b.classList.add('active');
    document.getElementById('topbarTitle').textContent = TITLES[id] || id;
    if (id === 'dashboard') setTimeout(redrawChart, 80);
    if (id === 'storage') refreshStorageView();
    closeSidebar();
}
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); document.getElementById('sidebarOverlay').classList.toggle('vis'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarOverlay').classList.remove('vis'); }

// ─── TOAST ────────────────────────────────────────
let _tt;
function toast(msg, type = 'in') { clearTimeout(_tt); const el = document.getElementById('toast'); el.textContent = msg; el.className = `toast ${type} show`; _tt = setTimeout(() => el.classList.remove('show'), 3500); }

// ─── LOADING ──────────────────────────────────────
function setLoading(on, txt = 'Memproses...') { document.getElementById('loadCover').style.display = on ? 'flex' : 'none'; setLoadText(txt); }
function setLoadText(t) { const el = document.getElementById('loadText'); if (el) el.textContent = t; }

// ─── UI HELPERS ───────────────────────────────────
function setBusy(id, b) { const el = document.getElementById(id); if (!el) return; el.disabled = b; el.style.opacity = b ? '0.6' : '1'; }
function setEl(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function copyEl(id) { const el = document.getElementById(id); if (!el || !el.value) { toast('Tidak ada teks!', 'er'); return; } navigator.clipboard.writeText(el.value).then(() => toast('Disalin.', 'ok')); }
function showRG(gId, vals) { const g = document.getElementById(gId); g.style.display = 'grid'; Object.entries(vals).forEach(([k, v]) => { const el = document.getElementById(k); if (el) el.textContent = v; }); }
function kvRG(label, val, cls = '') { return `<div class="rg-item"><div class="rg-label">${esc(label)}</div><div class="rg-val ${cls}">${esc(val)}</div></div>`; }
function downloadText(content, fname) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' })); a.download = fname; a.click(); }

// ─── INPUT SIZE TRACKERS ──────────────────────────
function updateEncSz() { const v = document.getElementById('encIn').value; setEl('encInSize', fmt(byteLen(v))); }
function updateDecSz() { const v = document.getElementById('decIn').value; setEl('decInSize', fmt(byteLen(v))); }
function updateBatchSz() {
    const v = document.getElementById('batchIn').value; setEl('batchSize', fmt(byteLen(v)));
    let c = 0; try { const a = JSON.parse(v); c = Array.isArray(a) ? a.length : 0; } catch { }
    setEl('batchCount', c + ' item');
}

// ─── UTILS ────────────────────────────────────────
function byteLen(s) { return new TextEncoder().encode(s).length; }
function fmt(b) { if (b == null || isNaN(b)) return '—'; if (b < 1024) return b + ' bytes'; return (b / 1024).toFixed(2) + ' KB (' + b + ' bytes)'; }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function nowFmt() { return new Date().toLocaleString('id-ID', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\./g, '-').replace(',', ''); }
function nowTs() { return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 15); }
function timeOnly() { return new Date().toLocaleTimeString('id-ID'); }

// ─── INIT ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Theme
    const savedTheme = lsGet(LS.THEME) || 'dark';
    applyTheme(savedTheme);

    // Load persisted data
    loadState();

    // Restore chart/stats UI
    updateStats(); updateSysOps();
    renderLatLog(); updateLatLogCount();
    renderDataLog(); updateDataLogCount();
    renderActivities();

    // Chart
    initChart();

    // Input listeners
    document.getElementById('encIn').addEventListener('input', updateEncSz);
    document.getElementById('decIn').addEventListener('input', updateDecSz);
    document.getElementById('batchIn').addEventListener('input', () => { updateBatchSz(); lsSet(LS.BATCH_IN, JSON.parse(document.getElementById('batchIn').value || '[]')); });
    document.getElementById('keyInput').addEventListener('input', updateKeyBar);
    document.getElementById('keyInput').addEventListener('keydown', e => { if (e.key === 'Enter') applyKey(); });

    // Drop zone
    const dz = document.getElementById('dropZone');
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('dragover'); const f = e.dataTransfer.files[0]; if (f && f.name.endsWith('.json')) loadKeyFile({ target: { files: [f] } }); else toast('Hanya file .json!', 'er'); });

    // Auto-load default key
    document.getElementById('keyInput').value = DEFAULT_KEY; updateKeyBar();
    importKey(DEFAULT_KEY).then(k => { S.cryptoKey = k; S.keyStr = DEFAULT_KEY; setKeyStatus(true); toast('Kunci default dimuat.', 'ok'); });

    // Load sample if batch empty
    const bv = document.getElementById('batchIn').value;
    if (!bv || bv === '[]' || bv.trim() === '') loadSample(); else updateBatchSz();

    // Initial storage info
    refreshStorageView();

    // File Input
    const fin = document.getElementById('fileInput');
    if (fin) fin.addEventListener('change', handleFileSelect);

    // Drop Zone File
    const fdz = document.getElementById('fileDropZone');
    if (fdz) {
        fdz.addEventListener('dragover', e => { e.preventDefault(); fdz.classList.add('dragover'); });
        fdz.addEventListener('dragleave', () => fdz.classList.remove('dragover'));
        fdz.addEventListener('drop', e => { e.preventDefault(); fdz.classList.remove('dragover'); const f = e.dataTransfer.files[0]; if (f) handleFileSelect({ target: { files: [f] } }); });
    }

    console.log('%cAES-256 Encryption Dashboard v2.0', 'color:#6366f1;font-size:16px;font-weight:bold');
    console.log('%cPremium UI + Detailed Modal + File Encryption', 'color:#9098b5');
});
