export interface ParsedTransaction {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // always positive
  rawType: "credit" | "debit";
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function extractTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}>\\s*([^<\\r\\n]*)`, "i"));
  return match ? match[1].trim() : null;
}

export function parseOfx(text: string): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  if (!text || typeof text !== "string") return results;

  const blockMatches = text.match(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi);
  if (!blockMatches) return results;

  for (const block of blockMatches) {
    try {
      const rawAmount = extractTag(block, "TRNAMT");
      const rawDate = extractTag(block, "DTPOSTED");
      const memo = extractTag(block, "MEMO");
      const name = extractTag(block, "NAME");

      if (!rawAmount || !rawDate) continue;

      const amountNum = parseFloat(rawAmount.replace(",", "."));
      if (Number.isNaN(amountNum)) continue;

      const digits = rawDate.match(/^(\d{8})/);
      if (!digits) continue;
      const yyyymmdd = digits[1];
      const year = yyyymmdd.slice(0, 4);
      const month = yyyymmdd.slice(4, 6);
      const day = yyyymmdd.slice(6, 8);
      const isoDate = `${year}-${month}-${day}`;

      const description = (memo || name || "Sem descrição").trim() || "Sem descrição";

      results.push({
        date: isoDate,
        description,
        amount: Math.abs(amountNum),
        rawType: amountNum < 0 ? "debit" : "credit",
      });
    } catch {
      continue;
    }
  }

  return results;
}

function detectDelimiter(firstLine: string): string {
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

function splitCsvLine(line: string, delimiter: string): string[] {
  return line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

const DATE_COLUMN_KEYWORDS = ["data", "date", "dt"];
const DESCRIPTION_COLUMN_KEYWORDS = ["descricao", "histor", "memo", "description"];
const VALUE_COLUMN_KEYWORDS = ["valor", "amount", "value"];

function findColumnIndex(headers: string[], keywords: string[]): number {
  return headers.findIndex((header) => keywords.some((keyword) => header.includes(keyword)));
}

function parseCsvDate(raw: string): string | null {
  const value = raw.trim();

  // YYYY-MM-DD
  let match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  // DD/MM/YYYY
  match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  // DD-MM-YYYY
  match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  return null;
}

function parseCsvAmount(raw: string): number | null {
  let value = raw.trim();
  if (!value) return null;

  // Remove currency symbols and whitespace
  value = value.replace(/[^\d.,-]/g, "");
  if (!value) return null;

  const hasComma = value.includes(",");
  const hasDot = value.includes(".");

  if (hasComma && hasDot) {
    // Comma is decimal separator, dot is thousands separator
    value = value.replace(/\./g, "").replace(",", ".");
  } else if (hasComma && !hasDot) {
    // Comma is decimal separator
    value = value.replace(",", ".");
  } else if (hasDot && !hasComma) {
    // Could be decimal or thousands separator
    const lastDotIndex = value.lastIndexOf(".");
    const digitsAfterLastDot = value.length - lastDotIndex - 1;
    if (digitsAfterLastDot > 2) {
      // Treat as thousands separator
      value = value.replace(/\./g, "");
    }
    // else: keep as decimal separator
  }

  const num = parseFloat(value);
  return Number.isNaN(num) ? null : num;
}

export function parseCsv(text: string): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  if (!text || typeof text !== "string") return results;

  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) return results;

  const delimiter = detectDelimiter(lines[0]);
  const rawHeaders = splitCsvLine(lines[0], delimiter);
  const normalizedHeaders = rawHeaders.map(normalizeText);

  const dateIdx = findColumnIndex(normalizedHeaders, DATE_COLUMN_KEYWORDS);
  const descIdx = findColumnIndex(normalizedHeaders, DESCRIPTION_COLUMN_KEYWORDS);
  const valueIdx = findColumnIndex(normalizedHeaders, VALUE_COLUMN_KEYWORDS);

  if (dateIdx === -1 || descIdx === -1 || valueIdx === -1) {
    return [];
  }

  for (let i = 1; i < lines.length; i++) {
    try {
      const cells = splitCsvLine(lines[i], delimiter);
      if (cells.length <= Math.max(dateIdx, descIdx, valueIdx)) continue;

      const isoDate = parseCsvDate(cells[dateIdx]);
      if (!isoDate) continue;

      const amountNum = parseCsvAmount(cells[valueIdx]);
      if (amountNum === null) continue;

      const description = cells[descIdx].trim() || "Sem descrição";

      results.push({
        date: isoDate,
        description,
        amount: Math.abs(amountNum),
        rawType: amountNum < 0 ? "debit" : "credit",
      });
    } catch {
      continue;
    }
  }

  return results;
}

export function detectStatementFormat(filename: string, text: string): "ofx" | "csv" | "unknown" {
  const lowerName = (filename || "").toLowerCase();

  if (lowerName.endsWith(".ofx") || lowerName.endsWith(".qfx")) {
    return "ofx";
  }

  if (lowerName.endsWith(".csv")) {
    return "csv";
  }

  if (typeof text === "string" && /<ofx>|<stmttrn>/i.test(text)) {
    return "ofx";
  }

  if (typeof text === "string" && text.trim() !== "") {
    return "csv";
  }

  return "unknown";
}
