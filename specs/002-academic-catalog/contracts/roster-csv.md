# Contract: Official Student List File (Roster CSV)

**Feature**: `002-academic-catalog` · Implements spec FR-014–FR-017, FR-021 · Decisions: research.md §1, §4, §6
· Code: `apps/web/src/lib/csv.ts` (bytes → records), `apps/web/src/features/roster/rules.ts` (records →
validated rows + problems)

This is the contract with the college: what Student Affairs may upload and how every file is judged.

## 1. File

| Property | Rule |
|---|---|
| Name | ends with `.csv` (any letter case); otherwise `file_type` |
| Size | 1 byte – 2 MB (2,097,152 bytes); 0 bytes → `file_empty`; larger → `file_too_large` (`meta.maxMb = 2`) |
| Kind | text only: a ZIP signature `50 4B 03 04` (`.xlsx`, `.ods`), an OLE signature `D0 CF 11 E0` (`.xls`), or any `00` byte → `file_type` (`meta.hint = 'workbook'` for the two signatures) |
| Encoding | in this order: `EF BB BF` → UTF-8 (BOM dropped); `FF FE` / `FE FF` → `file_encoding` (UTF-16; hint "save as CSV UTF-8"); valid strict UTF-8 → UTF-8; otherwise Windows-1256 |
| Line endings | CRLF, LF, or CR; final newline optional |
| Quoting | RFC 4180: a field may be wrapped in `"…"`; inside, `""` is a quote; separators and line breaks inside quotes are data. An unterminated quote → `file_malformed` (`meta.row` = row where the quote opened) |
| Separator | detected on the header record: the first of `,` `;` `\t` that yields ≥ 2 recognised headers; if none does, `,` is assumed (and `missing_columns` follows) |
| Records | the first non-blank record is the header; blank records (only separators/whitespace) are skipped but keep their row number; 0 data records → `file_empty`; more than 10,000 data records → `too_many_rows` (`meta.max = 10000`) |

Every whole-file problem above is returned as `fieldErrors.file` of the upload action; nothing is stored
(spec FR-015).

## 2. Header

Header cells are matched after `normalizeArabicText` (research.md §7; it removes invisible characters and
applies NFKC first) and replacing `_`/`-` with a space.
Recognised aliases (normalised form shown in parentheses where it differs):

| Column key | Arabic aliases | English aliases | Required |
|---|---|---|---|
| `student_code` | كود الطالب (كود الطالب), الكود (الكود), كود (كود) | student code, student_code, code | yes |
| `name` | الاسم (الاسم), اسم الطالب (اسم الطالب), الاسم بالكامل (الاسم بالكامل) | name, full name, student name | yes |
| `level` | الفرقة (الفرقه), الفرقه, المستوى (المستوي) | level, year | yes |
| `division` | الشعبة (الشعبه), الشعبه, القسم (القسم) | division, department | yes |

- A missing required column → `missing_columns`; `meta.columns` = the missing keys as one comma-joined
  string in the table's order (e.g. `'level,division'`, contracts/server-actions.md §1), translated in the
  UI.
- Two headers mapping to the same key → `duplicate_columns` (`meta.columns`, same encoding).
- Any other header is **ignored**: its values are dropped while reading and never stored; the header text
  (≤ 64 characters each, at most 20 names) is kept in the import summary so the report can say
  "ignored columns: …".

## 3. Values (per data record)

Every value first goes through `stripInvisible` (U+00AD, U+061C, U+200B–U+200F, U+202A–U+202E,
U+2060–U+2064, U+2066–U+2069, U+FEFF — research.md §1) and NFKC, then is trimmed. Row numbers are 1-based
record numbers including the header (header = row 1) and blank records — the row numbers a spreadsheet
shows.

| Column | Normalisation | Valid when | Problem codes |
|---|---|---|---|
| student code | `toWesternDigits`; **letter case kept** (compared exactly, like feature 001's profiles) | matches `^[A-Za-z0-9-]{3,20}$` (feature 001 FR-025) | empty → `code_required`; matches `^\d+(\.\d+)?[eE][+-]?\d+$` → `code_scientific`; otherwise invalid → `code_invalid`; same code (exact) as an earlier row → `code_duplicate` (`otherRow` = first row with it) |
| name | inner whitespace collapsed (stored this way; `name_search` = `normalizeArabicText` of it, data-model.md §3.7) | 2–100 characters | empty → `name_required`; otherwise → `name_length` |
| level | `toWesternDigits`, then `normalizeArabicText` | an integer 1–7 written in digits, or one of الاولي/الاولى, الثانيه, الثالثه, الرابعه, الخامسه, السادسه, السابعه (normalised forms of «الأولى» … «السابعة»), optionally preceded by «الفرقة» | empty → `level_required`; not a level → `level_invalid`; above the college's number of levels → `level_out_of_range` |
| division | trimmed | equals (case-insensitive) the code of one of the college's divisions, or (after `normalizeArabicText`) its Arabic name, or (case-insensitive) its English name; active or inactive divisions both count | empty → `division_required`; no match → `division_unknown`; matches two different divisions → `division_ambiguous` |
| (record) | — | has exactly as many fields as the header, ignoring empty trailing fields | otherwise → `wrong_field_count` (column `null`) |

A record with `wrong_field_count` gets no other problems. Other problems are independent: a record can get
one problem per column.

## 4. Report

- Problems are ordered by row, then column order `student_code`, `name`, `level`, `division`.
- The first 500 are stored and listed; `issue_count` holds the total; the screen shows "and N more problems".
- `value` (the offending text, truncated to 40 characters) is stored for `code_invalid`, `code_scientific`,
  `level_invalid`, `level_out_of_range`, `division_unknown`, `division_ambiguous`; names are never echoed.
- The report is shown in the catalog manager's language; values are rendered in an LTR isolate when they are
  codes or digits and with `dir="auto"` otherwise.

## 5. Problem codes

`RosterIssueCode` (in `@masari/db` `roster/types.ts`; message keys `roster.issues.<code>` in both
catalogs):

`wrong_field_count` · `code_required` · `code_invalid` · `code_scientific` · `code_duplicate` ·
`name_required` · `name_length` · `level_required` · `level_invalid` · `level_out_of_range` ·
`division_required` · `division_unknown` · `division_ambiguous`

Whole-file field error codes (added to `FieldErrorCode`, `apps/web/src/lib/result.ts`): `file_empty` ·
`file_too_large` · `file_type` · `file_encoding` · `file_malformed` · `missing_columns` ·
`duplicate_columns` · `too_many_rows` (plus the existing `required` when no file is chosen).

## 6. Template

`apps/web/public/templates/roster-template.csv`: UTF-8 with BOM, CRLF, header
`كود الطالب,الاسم,الفرقة,الشعبة` and no data rows. The roster screen links to it with instructions: keep the
header, one student per row, format the code column as **Text** before typing or pasting codes (Excel drops
leading zeros and turns long numbers into scientific notation), and save as "CSV UTF-8" (plain "CSV" also
works on Arabic Windows).

## 7. Test fixtures

`apps/web/e2e/support/roster-files.ts` builds byte buffers from row arrays: `utf8(rows, { bom })`,
`windows1256(rows)` (encoder built by inverting `new TextDecoder('windows-1256')` over bytes `0x80–0xFF`),
`utf16le(rows)`, and `fakeXlsx()` (ZIP signature + filler). Names are synthetic (e.g. «طالب تجريبي أول»);
no real student data is committed (constitution III).
