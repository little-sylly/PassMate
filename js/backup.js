/* Backup code: the whole store as one short line of text she can keep in a note and paste back.
   No account, no server (BUILD_PLAN: In-app browser risk). Pure logic, no DOM.

   Code = 'PM1.' + base64url( [version 1][length 4][FNV-1a 4][LZW bits] )
   The payload is the store's JSON (UTF-8), LZW-compressed with 9-16 bit codes. The length and
   checksum catch a code that was cut short or changed while copying. Whitespace and line breaks
   added by a notes app are ignored, and so is any text around the code. */
(function (PM) {
  'use strict';
  var FORMAT = 1, MAX = 1 << 16;
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  // ---- text <-> bytes (a "byte string": one char per byte, 0-255) -----------------------------------
  function utf8(str) { return unescape(encodeURIComponent(str)); }
  function unutf8(bytes) { return decodeURIComponent(escape(bytes)); }

  function fnv(bytes) {
    var h = 0x811c9dc5;
    for (var i = 0; i < bytes.length; i++) { h ^= bytes.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }

  function bitsFor(n) { var b = 1; while ((1 << b) < n) b++; return b; }

  // ---- LZW --------------------------------------------------------------------------------------------
  // Code i is written with bitsFor(next) bits, where next is the dictionary size when it is written.
  function compress(bytes) {
    var dict = {}, next = 256, out = [], acc = 0, nAcc = 0, w = '', i;
    for (i = 0; i < 256; i++) dict[String.fromCharCode(i)] = i;
    function put(code, width) {
      for (var b = width - 1; b >= 0; b--) {
        acc = (acc << 1) | ((code >>> b) & 1);
        if (++nAcc === 8) { out.push(acc); acc = 0; nAcc = 0; }
      }
    }
    for (i = 0; i < bytes.length; i++) {
      var c = bytes.charAt(i), wc = w + c;
      if (Object.prototype.hasOwnProperty.call(dict, wc)) { w = wc; continue; }
      put(dict[w], bitsFor(next));
      if (next < MAX) dict[wc] = next++;
      w = c;
    }
    if (w) put(dict[w], bitsFor(next));
    if (nAcc) out.push(acc << (8 - nAcc));
    return out;
  }

  function decompress(data, start, length) {
    var pos = start * 8, end = data.length * 8;
    function get(width) {
      if (pos + width > end) throw new Error('short');
      var v = 0;
      for (var b = 0; b < width; b++, pos++) v = (v << 1) | ((data[pos >> 3] >> (7 - (pos & 7))) & 1);
      return v;
    }
    if (!length) return '';
    var dict = [], next = 256, i;
    for (i = 0; i < 256; i++) dict[i] = String.fromCharCode(i);
    var prev = dict[get(8)], parts = [prev], n = prev.length;
    while (n < length) {
      var code = get(bitsFor(Math.min(next + 1, MAX)));
      var entry = code < next ? dict[code] : code === next && next < MAX ? prev + prev.charAt(0) : null;
      if (entry == null) throw new Error('bad code');
      parts.push(entry); n += entry.length;
      if (next < MAX) dict[next++] = prev + entry.charAt(0);
      prev = entry;
    }
    var outStr = parts.join('');
    if (outStr.length !== length) throw new Error('length');
    return outStr;
  }

  // ---- base64url (no padding) -------------------------------------------------------------------------
  function toB64(bytes) {
    var s = '', i;
    for (i = 0; i + 2 < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      s += B64[n >> 18 & 63] + B64[n >> 12 & 63] + B64[n >> 6 & 63] + B64[n & 63];
    }
    var rest = bytes.length - i;
    if (rest === 1) { var a = bytes[i] << 16; s += B64[a >> 18 & 63] + B64[a >> 12 & 63]; }
    else if (rest === 2) { var b = (bytes[i] << 16) | (bytes[i + 1] << 8); s += B64[b >> 18 & 63] + B64[b >> 12 & 63] + B64[b >> 6 & 63]; }
    return s;
  }
  function fromB64(s) {
    var out = [], acc = 0, n = 0;
    for (var i = 0; i < s.length; i++) {
      var v = B64.indexOf(s.charAt(i));
      if (v < 0) throw new Error('char');
      acc = (acc << 6) | v; n += 6;
      if (n >= 8) { n -= 8; out.push((acc >> n) & 255); }
    }
    return out;
  }

  function u32(a, v) { a.push(v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255); }
  function r32(a, i) { return ((a[i] << 24) | (a[i + 1] << 16) | (a[i + 2] << 8) | a[i + 3]) >>> 0; }

  // ---- the code ----------------------------------------------------------------------------------------
  function make(rec) {
    rec = rec || PM.store.get();
    var bytes = utf8(JSON.stringify({t: new Date().toISOString(), s: rec}));
    var head = [FORMAT];
    u32(head, bytes.length); u32(head, fnv(bytes));
    return 'PM' + FORMAT + '.' + toB64(head.concat(compress(bytes)));
  }

  // -> {ok: true, rec, at} or {ok: false, error: 'empty' | 'bad' | 'newer'}
  function read(text) {
    var flat = String(text || '');
    try { flat = flat.normalize('NFKC'); } catch (e) { /* old WebView */ }
    flat = flat.replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, '').replace(/[\u2010-\u2015\u2212\uFE63]/g, '-').replace(/\s+/g, '');
    if (!flat) return {ok: false, error: 'empty'};
    var m = /PM(\d+)\.([A-Za-z0-9_-]+)/.exec(flat);
    if (!m) return {ok: false, error: 'bad'};
    if (+m[1] > FORMAT) return {ok: false, error: 'newer'};
    try {
      var data = fromB64(m[2]);
      if (data.length < 9 || data[0] !== FORMAT) return {ok: false, error: 'bad'};
      var length = r32(data, 1), sum = r32(data, 5);
      var bytes = decompress(data, 9, length);
      if (fnv(bytes) !== sum) return {ok: false, error: 'bad'};
      var wrap = JSON.parse(unutf8(bytes)), rec = wrap && wrap.s;
      if (!rec || typeof rec !== 'object' || typeof rec.v !== 'number' || !rec.items || typeof rec.items !== 'object') return {ok: false, error: 'bad'};
      if (rec.v > PM.config.storeVersion) return {ok: false, error: 'newer'};
      return {ok: true, rec: rec, at: wrap.t || null};
    } catch (e) {
      return {ok: false, error: 'bad'};
    }
  }

  function restore(text) {
    var r = read(text);
    if (r.ok) PM.store.replace(r.rec);
    return r;
  }

  PM.backup = {make: make, read: read, restore: restore};
})(window.PM = window.PM || {});
