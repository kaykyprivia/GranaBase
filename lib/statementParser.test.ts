import { describe, expect, it } from "vitest";
import { detectStatementFormat, parseCsv, parseOfx } from "@/lib/statementParser";

describe("parseOfx", () => {
  it("extracts debit and credit transactions from a valid OFX", () => {
    const ofx = `
      <OFX>
      <BANKTRANLIST>
      <STMTTRN>
      <TRNTYPE>DEBIT
      <DTPOSTED>20260615120000
      <TRNAMT>-150.00
      <MEMO>Supermercado ABC
      </STMTTRN>
      <STMTTRN>
      <TRNTYPE>CREDIT
      <DTPOSTED>20260610090000
      <TRNAMT>2500.00
      <NAME>Salario Empresa
      </STMTTRN>
      <STMTTRN>
      <TRNTYPE>DEBIT
      <DTPOSTED>20260601000000
      <TRNAMT>-45.90
      <MEMO>Posto de gasolina
      </STMTTRN>
      </BANKTRANLIST>
      </OFX>
    `;

    const result = parseOfx(ofx);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      date: "2026-06-15",
      description: "Supermercado ABC",
      amount: 150.0,
      rawType: "debit",
    });
    expect(result[1]).toEqual({
      date: "2026-06-10",
      description: "Salario Empresa",
      amount: 2500.0,
      rawType: "credit",
    });
    expect(result[2].rawType).toBe("debit");
    expect(result[2].amount).toBe(45.9);
  });

  it("skips malformed blocks but still extracts the valid ones", () => {
    const ofx = `
      <STMTTRN>
      <DTPOSTED>20260605000000
      <TRNAMT>-99.99
      <MEMO>Conta de luz
      </STMTTRN>
      <STMTTRN>
      <TRNTYPE>DEBIT
      <MEMO>Bloco sem valor nem data
      </STMTTRN>
      <STMTTRN>
      <DTPOSTED>20260607000000
      <TRNAMT>300.00
      <MEMO>Deposito
      </STMTTRN>
    `;

    const result = parseOfx(ofx);

    expect(result).toHaveLength(2);
    expect(result[0].description).toBe("Conta de luz");
    expect(result[1].description).toBe("Deposito");
    expect(result[1].rawType).toBe("credit");
  });

  it("returns an empty array for text with no STMTTRN blocks", () => {
    expect(parseOfx("not an ofx file at all")).toEqual([]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseOfx("")).toEqual([]);
  });
});

describe("parseCsv", () => {
  it("parses a CSV with BR-formatted decimal comma and semicolon delimiter", () => {
    const csv = "Data;Descricao;Valor\n15/06/2026;Mercado;-150,50\n10/06/2026;Salario;2500,00";

    const result = parseCsv(csv);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      date: "2026-06-15",
      description: "Mercado",
      amount: 150.5,
      rawType: "debit",
    });
    expect(result[1]).toEqual({
      date: "2026-06-10",
      description: "Salario",
      amount: 2500,
      rawType: "credit",
    });
  });

  it("recognizes header variations like 'Histórico' for description", () => {
    const csv = "Date,Historico,Value\n2026-06-01,Pagamento freelancer,1000.00";

    const result = parseCsv(csv);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      date: "2026-06-01",
      description: "Pagamento freelancer",
      amount: 1000,
      rawType: "credit",
    });
  });

  it("returns an empty array when no recognizable columns exist", () => {
    const csv = "Col1,Col2,Col3\nabc,def,ghi";

    expect(parseCsv(csv)).toEqual([]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("skips malformed rows but keeps processing the rest", () => {
    const csv = "Data,Descricao,Valor\n15/06/2026,Compra valida,-100,00\nlinha,quebrada\n01/06/2026,Outra compra,-50,00";

    const result = parseCsv(csv);

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some((t) => t.description === "Compra valida")).toBe(true);
  });

  it("handles thousands separator with dot and decimal comma (BR long format)", () => {
    const csv = "Data;Descricao;Valor\n01/06/2026;Compra grande;-1.234,56";

    const result = parseCsv(csv);

    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(1234.56);
  });
});

describe("detectStatementFormat", () => {
  it("detects ofx by file extension", () => {
    expect(detectStatementFormat("extrato.ofx", "")).toBe("ofx");
    expect(detectStatementFormat("extrato.QFX", "")).toBe("ofx");
  });

  it("detects csv by file extension", () => {
    expect(detectStatementFormat("extrato.csv", "")).toBe("csv");
  });

  it("falls back to content sniffing when extension is ambiguous", () => {
    expect(detectStatementFormat("extrato.txt", "<OFX><STMTTRN></STMTTRN></OFX>")).toBe("ofx");
    expect(detectStatementFormat("extrato.txt", "Data,Descricao,Valor")).toBe("csv");
  });

  it("returns unknown for empty ambiguous input", () => {
    expect(detectStatementFormat("extrato.txt", "")).toBe("unknown");
  });
});
