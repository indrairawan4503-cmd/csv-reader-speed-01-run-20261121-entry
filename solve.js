// v3 reconstruction for A/B benchmarking (identical logic to the v3 write).
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const len = text.length;
  let pos = 0;
  let line = 1;
  let recordLine = 1;
  let recordRow = null;
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  function finish(fields, quoted, rl, rr) {
    if (fields.length === 1 && fields[0] === '' && !quoted) return;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: rl, row: rr, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: rl, row: rr, extra: fields.slice(width) });
      fields.length = width;
    }
    rows.push(fields);
  }

  function fold(val, p, q) {
    const seg = text.slice(p, q);
    if (seg.indexOf('\r') === -1 && seg.indexOf('\n') === -1) return val + seg;
    const m = seg.length;
    let out = val;
    let s = 0;
    let i = 0;
    while (i < m) {
      const ch = seg.charCodeAt(i);
      if (ch === 13) {
        out += seg.slice(s, i) + '\n';
        line += 1;
        i += i + 1 < m && seg.charCodeAt(i + 1) === 10 ? 2 : 1;
        s = i;
      } else if (ch === 10) {
        out += seg.slice(s, i) + '\n';
        line += 1;
        i += 1;
        s = i;
      } else {
        i += 1;
      }
    }
    return out + seg.slice(s, m);
  }

  while (pos < len) {
    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    const nl = text.indexOf('\n', pos);
    const end = nl === -1 ? len : nl;
    const seg = text.slice(pos, end);
    if (seg.indexOf('"') === -1) {
      const r = seg.indexOf('\r');
      if (r === -1) {
        const fields = seg.split(',');
        pos = nl === -1 ? len : nl + 1;
        if (nl !== -1) line += 1;
        finish(fields, false, recordLine, recordRow);
        continue;
      }
      if (nl !== -1 && r === seg.length - 1) {
        const fields = seg.slice(0, -1).split(',');
        pos = nl + 1;
        line += 1;
        finish(fields, false, recordLine, recordRow);
        continue;
      }
    }

    const fields = [];
    let quoted = false;
    let ended = END;
    let pendingInit = null;
    let pendingJunk = false;
    for (;;) {
      let value;
      if (pendingInit === null && text.charCodeAt(pos) === 34) {
        quoted = true;
        const open = pos;
        const openLine = line;
        let val = '';
        let p = pos + 1;
        let closed = false;
        let closeQ = -1;
        for (;;) {
          const q = text.indexOf('"', p);
          if (q === -1) break;
          if (text.charCodeAt(q + 1) === 34) {
            val = fold(val, p, q) + '"';
            p = q + 2;
            continue;
          }
          val = fold(val, p, q);
          closeQ = q;
          closed = true;
          break;
        }
        if (!closed) {
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          line = openLine;
          pos = open;
          pendingInit = '';
          pendingJunk = false;
          continue;
        }
        pos = closeQ + 1;
        if (pos >= len) {
          value = val;
          ended = END;
        } else {
          const ch = text.charCodeAt(pos);
          if (ch === 44) {
            value = val;
            ended = COMMA;
            pos += 1;
          } else if (ch === 10) {
            value = val;
            ended = LINE_BREAK;
            pos += 1;
            line += 1;
          } else if (ch === 13 && text.charCodeAt(pos + 1) === 10) {
            value = val;
            ended = LINE_BREAK;
            pos += 2;
            line += 1;
          } else {
            pendingInit = val;
            pendingJunk = true;
            continue;
          }
        }
      } else {
        if (pendingInit === null) quoted = false;
        const init = pendingInit === null ? '' : pendingInit;
        const junk = pendingJunk;
        pendingInit = null;
        pendingJunk = false;
        let v = init;
        for (;;) {
          let p = pos;
          while (p < len) {
            const ch = text.charCodeAt(p);
            if (ch === 44 || ch === 10 || ch === 13) break;
            p += 1;
          }
          if (p >= len) {
            v += text.slice(pos, len);
            pos = len;
            ended = END;
            break;
          }
          const ch = text.charCodeAt(p);
          if (ch === 44) {
            v += text.slice(pos, p);
            pos = p + 1;
            ended = COMMA;
            break;
          }
          if (ch === 10) {
            v += text.slice(pos, p);
            pos = p + 1;
            line += 1;
            ended = LINE_BREAK;
            break;
          }
          if (text.charCodeAt(p + 1) === 10) {
            v += text.slice(pos, p);
            pos = p + 2;
            line += 1;
            ended = LINE_BREAK;
            break;
          }
          errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
          v += text.slice(pos, p);
          pos = p + 1;
        }
        if (junk && v.length > init.length) {
          errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
        }
        value = v;
      }
      fields.push(value);
      if (ended !== COMMA) break;
    }
    finish(fields, quoted, recordLine, recordRow);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
