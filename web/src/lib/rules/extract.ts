import { readFileSync } from "node:fs";
import { PDFParse } from "pdf-parse";

/** ローカルPDFから全文テキストを抽出 */
export async function extractPdfText(pdfPath: string): Promise<string> {
  const data = readFileSync(pdfPath);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy();
  }
}
