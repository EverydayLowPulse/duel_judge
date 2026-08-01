import { readFile } from "node:fs/promises";
import { extractText, getDocumentProxy } from "unpdf";

/**
 * ローカルPDFから全文テキストを抽出。
 * pdf-parse / pdfjs は Vercel 上で DOMMatrix 未定義になるため unpdf（serverless向け）を使う。
 */
export async function extractPdfText(pdfPath: string): Promise<string> {
  const data = new Uint8Array(await readFile(pdfPath));
  const pdf = await getDocumentProxy(data);
  const result = await extractText(pdf, { mergePages: true });
  return result.text ?? "";
}
