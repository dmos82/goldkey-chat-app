declare module 'pdf-parse' {
  export interface PDFData {
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    text: string;
    version: string;
  }

  export interface PDFOptions {
    pagerender?: (pageData: any) => Promise<string>;
    onPageRender?: (pageNumber: number, text: string) => void;
  }

  function PDFParse(dataBuffer: Buffer, options?: PDFOptions): Promise<PDFData>;
  export default PDFParse;
}

declare module 'pdf-parse/lib/pdf-parse' {
  export * from 'pdf-parse';
} 