// Fast CSV reader matching csv-reader 1.0.0's exact answers.
//
// Written from the reference policy (RULES.txt / the kit's reference reader):
// text is read once, left to right; a U+FEFF at the very start is dropped; a
// record ends at LF or CRLF and a line left with no characters is no record;
// outside quotes a CR not followed by LF is dropped (stray_cr); a field that
// opens with a quote runs to the next quote that is not doubled ("" is one
// quote, each CRLF or lone CR inside it reads as LF); what follows its closing
// quote up to the next comma or line break is appended as it stands
// (quote_junk when the field ends); a quote that never closes is a literal
// character and the text after it is read again as unquoted
// (unterminated_quote); a quote inside an unquoted field is literal; fields
// stay strings, never trimmed or converted; columns is the first record when
// header is true, else null; rows are padded (short_row) or cut (long_row) to
// the first record's width; each error is {code, line, row} in the order met,
// line the 1-based line its record starts on, row its index in rows (null for
// the header).
//
// Speed lever: the reference walks one character at a time and builds every
// field by concatenation. This reader jumps instead: a whole record whose line
// holds no quote and no CR is split in one C++ call; an unquoted field is
// found with indexOf jumps and a CR check that walks only the field itself;
// a quoted field jumps from quote to quote with indexOf and slices its
// content whole, collapsing doubled quotes and normalising CRs only when
// they are present. No per-character work happens on the hot path.

const RE_LINE_SPECIAL = /["\r]/g; // quote or CR inside one line
const RE_BREAKS = /\r\n|\r|\n/g; // one line break, CRLF counted once

const END_COMMA = 0;
const END_BREAK = 1;
const END_TEXT = 2;

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const len = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters onto `value` up to the next comma or line break:
  // a CR not followed by LF is dropped (stray_cr). Returns the field, how it
  // ended and how many characters were kept onto it. The terminators are
  // found with indexOf (C++ scans) and the CR check walks only the field
  // itself, so no scan ever runs past the field's end.
  function readUnquoted(value) {
    let added = 0;
    let cur = pos;
    for (;;) {
      const c = text.indexOf(',', cur);
      const n = text.indexOf('\n', cur);
      let end = len;
      let kind = END_TEXT;
      if (c !== -1) {
        end = c;
        kind = END_COMMA;
      }
      if (n !== -1 && n < end) {
        end = n;
        kind = END_BREAK;
      }
      let r = -1;
      for (let i = cur; i < end; i++) {
        if (text.charCodeAt(i) === 13) {
          r = i;
          break;
        }
      }
      if (r !== -1) {
        // CR: a line break when LF follows, else a dropped stray_cr.
        if (text.charCodeAt(r + 1) === 10) {
          if (r > cur) {
            value += text.slice(cur, r);
            added += r - cur;
          }
          pos = r + 2;
          line += 1;
          return { value, ended: END_BREAK, added };
        }
        if (r > cur) {
          value += text.slice(cur, r);
          added += r - cur;
        }
        error('stray_cr');
        cur = r + 1;
        continue;
      }
      if (end > cur) {
        value += text.slice(cur, end);
        added += end - cur;
      }
      if (kind === END_COMMA) {
        pos = end + 1;
        return { value, ended: END_COMMA, added };
      }
      if (kind === END_BREAK) {
        pos = end + 1;
        line += 1;
        return { value, ended: END_BREAK, added };
      }
      pos = len;
      return { value, ended: END_TEXT, added };
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let segStart = pos + 1;
    let cur = pos + 1;
    let parts = null; // segments kept when a doubled quote is met, else null
    for (;;) {
      const q = text.indexOf('"', cur);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        error('unterminated_quote');
        return readUnquoted('"');
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote is one literal quote inside the field.
        if (parts === null) parts = [];
        parts.push(text.slice(segStart, q + 1));
        cur = q + 2;
        segStart = q + 2;
        continue;
      }
      // The closing quote at q: the content is whole, unless doubled quotes
      // were met (then the kept segments join it).
      let content;
      if (parts === null) content = text.slice(segStart, q);
      else {
        parts.push(text.slice(segStart, q));
        content = parts.join('');
      }
      // Line breaks inside the quotes count, and each CRLF or lone CR in
      // the content reads as one LF.
      let value = content;
      if (content.indexOf('\r') !== -1) {
        RE_BREAKS.lastIndex = 0;
        let breaks = 0;
        while (RE_BREAKS.exec(content) !== null) breaks += 1;
        line += breaks;
        value = content.replace(/\r\n?/g, '\n');
      } else {
        let at = content.indexOf('\n');
        while (at !== -1) {
          line += 1;
          at = content.indexOf('\n', at + 1);
        }
      }
      pos = q + 1;
      if (pos >= len) return { value, ended: END_TEXT };
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        return { value, ended: END_COMMA };
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        return { value, ended: END_BREAK };
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        return { value, ended: END_BREAK };
      }
      // What follows the closing quote is appended as it stands, up to the
      // next comma or line break.
      const junk = readUnquoted(value);
      if (junk.added > 0) error('quote_junk');
      return junk;
    }
  }

  // Finishes a record: header, or a row padded or cut to the first width.
  function finishRecord(fields) {
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else break;
    }
    if (pos >= len) break;

    // Fast path: a record whose whole line holds no quote and no CR is one
    // split — every field is unquoted and the line ends at its break.
    const eol = text.indexOf('\n', pos);
    const lineEnd = eol === -1 ? len : eol;
    let segEnd = lineEnd;
    let trailingCr = false;
    if (lineEnd > pos && text.charCodeAt(lineEnd - 1) === 13) {
      segEnd = lineEnd - 1;
      if (eol === -1) trailingCr = true; // a lone CR at the end of the text
    }
    let plain = true;
    if (segEnd > pos) {
      RE_LINE_SPECIAL.lastIndex = pos;
      const m = RE_LINE_SPECIAL.exec(text);
      if (m !== null && m.index < segEnd) plain = false;
    }
    if (plain) {
      recordLine = line;
      recordRow = header && columns === null ? null : rows.length;
      const segment = text.slice(pos, segEnd);
      pos = eol === -1 ? len : eol + 1;
      if (eol !== -1) line += 1;
      if (trailingCr) error('stray_cr');
      if (segment === '') continue; // a line that held only a stray CR
      finishRecord(segment.split(','));
      continue;
    }

    // General path: read the record one field at a time.
    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let field;
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === 34;
      field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
    } while (field.ended === END_COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;
    finishRecord(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
