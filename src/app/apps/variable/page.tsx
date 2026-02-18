'use client';

import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';

// Types
type ViewState = 'upload' | 'processing' | 'results' | 'error';
interface TableData {
  page: number;
  data: string[][];
  columns: number;
}
interface Stats {
  pages: number;
  tables: number;
  rows: number;
  cells: number;
}

export default function PDFToExcelConverter() {
  const [view, setView] = useState<ViewState>('upload');
  const [fileInfo, setFileInfo] = useState<{ name: string; size: string } | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Initializing...');
  const [isDragging, setIsDragging] = useState(false);
  const [extractedData, setExtractedData] = useState<string[][]>([]);
  const [stats, setStats] = useState<Stats>({ pages: 0, tables: 0, rows: 0, cells: 0 });
  const [errorMessage, setErrorMessage] = useState('');
  
  const [isStructured, setIsStructured] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const TARGET_HEADERS = ['date', 'description', 'rate', 'quantity', 'amount'];

  const loadPdfJs = useCallback(async () => {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
    return pdfjsLib;
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      setErrorMessage('Please upload a valid PDF file.');
      setView('error');
      return;
    }

    setFileInfo({ name: file.name, size: formatFileSize(file.size) });
    setView('processing');
    setProgress(0);
    setStatusText('Loading PDF file...');
    setIsStructured(false);

    try {
      const pdfjsLib = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      const numPages = pdf.numPages;
      
      let headerMap: { [key: string]: number } | null = null;
      let specificData: string[][] = [];
      let foundHeaderRow = false;
      let genericData: string[][] = [];

      updateProgress(10, `Scanning ${numPages} pages for headers...`);

      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        updateProgress(10 + (i / numPages) * 60, `Processing page ${i} of ${numPages}...`);
        
        const rawRows = extractRawRows(textContent.items);

        if (!foundHeaderRow) {
          for (let r = 0; r < rawRows.length; r++) {
            const row = rawRows[r];
            const detectedMap = detectHeaderRow(row);
            
            if (detectedMap) {
              headerMap = detectedMap;
              foundHeaderRow = true;
              
              specificData.push(['Date', 'Description', 'Rate', 'Quantity', 'Amount']);
              
              const remainingRows = rawRows.slice(r + 1);
              const { extracted } = processRowsWithMap(remainingRows, headerMap);
              specificData = specificData.concat(extracted);
              
              updateProgress(80, 'Header found! Extracting data...');
              break;
            }
          }
        } else {
          const { extracted } = processRowsWithMap(rawRows, headerMap!);
          specificData = specificData.concat(extracted);
        }

        if (!foundHeaderRow) {
            genericData = genericData.concat(rawRows);
        }
      }

      updateProgress(90, 'Finalizing data...');

      let finalData: string[][] = [];
      
      if (foundHeaderRow && headerMap) {
        finalData = specificData;
        setIsStructured(true);
        
        finalData = finalData.filter((row, index) => {
            if (index === 0) return true;
            const hasContent = row.some(cell => cell.trim() !== '');
            const isTotalRow = row[1]?.toLowerCase().includes('total');
            return hasContent && !isTotalRow;
        });

      } else {
        finalData = genericData;
        setIsStructured(false);
      }

      if (finalData.length <= 1 && foundHeaderRow) {
        throw new Error('Found headers but could not extract data rows. The PDF structure might be non-standard.');
      }
      
      if (finalData.length === 0) {
         throw new Error('No tables found or headers (Date, Description, Rate, Quantity, Amount) not detected.');
      }

      updateProgress(100, 'Complete!');
      
      setExtractedData(finalData);
      
      const totalRows = finalData.length - (foundHeaderRow ? 1 : 0);
      setStats({ 
        pages: numPages, 
        tables: foundHeaderRow ? 1 : 0, 
        rows: totalRows, 
        cells: finalData.reduce((sum, row) => sum + row.length, 0) 
      });
      
      setTimeout(() => setView('results'), 500);

    } catch (error: any) {
      console.error('Error processing PDF:', error);
      setErrorMessage(error.message || 'Failed to process PDF file');
      setView('error');
    }
  };

  const extractRawRows = (items: any[]): string[][] => {
    const rows = new Map<number, any[]>();
    
    items.forEach(item => {
      if (!('str' in item) || !item.str.trim()) return;
      const yKey = Math.round(item.transform[5] / 5) * 5; 
      if (!rows.has(yKey)) rows.set(yKey, []);
      rows.get(yKey)!.push({
        text: item.str,
        x: item.transform[4]
      });
    });

    return Array.from(rows.entries())
      .sort((a, b) => b[0] - a[0])
      .map(entry => 
        entry[1]
          .sort((a, b) => a.x - b.x)
          .map(item => item.text)
      );
  };

  const detectHeaderRow = (row: string[]): { [key: string]: number } | null => {
    const lowerRow = row.map(cell => cell.toLowerCase());
    const map: { [key: string]: number } = {};
    let foundCount = 0;

    TARGET_HEADERS.forEach(header => {
      const index = lowerRow.findIndex(cellText => {
        return cellText.includes(header); 
      });

      if (index !== -1) {
        map[header] = index;
        foundCount++;
      }
    });

    if (foundCount === TARGET_HEADERS.length) {
      return map;
    }
    return null;
  };

  const processRowsWithMap = (rows: string[][], map: { [key: string]: number }) => {
    const extracted: string[][] = [];
    const dateRegex = /^\d{1,2}\/\d{1,2}\/\d{4}$/;

    rows.forEach(row => {
      const newRow = TARGET_HEADERS.map(header => {
        const idx = map[header];
        return row[idx] || '';
      });
      
      const isEmpty = newRow.every(cell => cell.trim() === '');
      const isHeaderRepeat = newRow.every((cell, i) => 
        cell.toLowerCase().includes(TARGET_HEADERS[i])
      );

      if (isEmpty || isHeaderRepeat) {
        return;
      }

      const dateValue = newRow[0].trim();
      const isDateValid = dateRegex.test(dateValue);

      if (!isDateValid && extracted.length > 0) {
        const lastRow = extracted[extracted.length - 1];
        let textToAppend = '';
        
        if (newRow[0]) textToAppend += newRow[0];
        if (newRow[1]) {
            if (textToAppend) textToAppend += ' ';
            textToAppend += newRow[1];
        }

        if (textToAppend) {
            lastRow[1] = (lastRow[1] + ' ' + textToAppend).replace(/\s+/g, ' ').trim();
        }
      } else {
        extracted.push(newRow);
      }
    });

    return { extracted };
  };

  const updateProgress = (percent: number, status: string) => {
    setProgress(percent);
    setStatusText(status);
  };

  // Helper to parse currency/number strings safely
  const parseNumber = (val: string): number => {
    if (!val) return 0;
    // Remove $, commas, and handle negative numbers in parentheses or with dashes
    const cleanStr = val.toString().replace(/[$,]/g, '').trim();
    const num = parseFloat(cleanStr);
    return isNaN(num) ? 0 : num;
  };

  const downloadExcel = () => {
    if (extractedData.length === 0) return;
    const wb = XLSX.utils.book_new();
    
    // 1. Create the sheet from the data
    const ws = XLSX.utils.aoa_to_sheet(extractedData);
    
    // 2. Define formatting styles
    const currencyFormat = '"$"#,##0.00'; // Standard currency format
    
    // 3. Iterate over the range to apply formats and types
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    
    for (let R = range.s.r + 1; R <= range.e.r; ++R) { // Start from row 1 (skip header)
      
      // Column Indexes based on TARGET_HEADERS order:
      // Date (0), Description (1), Rate (2), Quantity (3), Amount (4)

      // --- Rate Column (Index 2) ---
      const rateCellAddress = XLSX.utils.encode_cell({ r: R, c: 2 });
      if (ws[rateCellAddress]) {
        const val = ws[rateCellAddress].v;
        ws[rateCellAddress].t = 'n'; // Set type to Number
        ws[rateCellAddress].v = parseNumber(val as string); // Parse value
        ws[rateCellAddress].z = currencyFormat; // Apply Currency Format
      }

      // --- Quantity Column (Index 3) ---
      const qtyCellAddress = XLSX.utils.encode_cell({ r: R, c: 3 });
      if (ws[qtyCellAddress]) {
        const val = ws[qtyCellAddress].v;
        ws[qtyCellAddress].t = 'n'; // Set type to Number
        ws[qtyCellAddress].v = parseNumber(val as string); // Parse value
        // Quantity is usually a plain number, no special 'z' format needed unless specific decimals required
      }

      // --- Amount Column (Index 4) ---
      const amountCellAddress = XLSX.utils.encode_cell({ r: R, c: 4 });
      if (ws[amountCellAddress]) {
        const val = ws[amountCellAddress].v;
        ws[amountCellAddress].t = 'n'; // Set type to Number
        ws[amountCellAddress].v = parseNumber(val as string); // Parse value
        ws[amountCellAddress].z = currencyFormat; // Apply Currency Format
      }
    }

    const colWidths = [{ wch: 15 }, { wch: 40 }, { wch: 12 }, { wch: 10 }, { wch: 15 }];
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'Extracted Data');
    const fileName = fileInfo?.name.replace('.pdf', '') || 'document';
    XLSX.writeFile(wb, `${fileName}_converted.xlsx`);
  };

  const resetApp = () => {
    setView('upload');
    setFileInfo(null);
    setProgress(0);
    setExtractedData([]);
    setStats({ pages: 0, tables: 0, rows: 0, cells: 0 });
    setErrorMessage('');
    setIsStructured(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) handleFile(e.target.files[0]);
  };

  return (
    <main className="dark relative z-10 min-h-screen px-4 py-8 md:py-12">
      <div className="max-w-5xl mx-auto">
        
        {/* Header */}
        <header className="text-center mb-12 fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border mb-6">
            <span className="w-2 h-2 rounded-full bg-[var(--neon-blue)] animate-pulse"></span>
            <span className="text-sm text-muted-foreground font-mono">• Smart Header Detection • Auto Formatting</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-4 tracking-tight text-foreground">
            PDF to Excel<br />
            <span className="text-[var(--neon-blue)] text-glow">Variable Invoice</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Automatically detects specific headers (Date, Description, Rate, Quantity, Amount) 
            and extracts clean data tables.
          </p>
        </header>

        {/* Upload Section */}
        {view === 'upload' && (
          <section className="mb-8 fade-in stagger-1">
            <div
              className={`glass rounded-2xl p-8 md:p-12 text-center cursor-pointer border-2 border-dashed transition-all duration-300 ${
                isDragging ? 'border-[var(--neon-purple)] bg-[var(--neon-purple)]/10 scale-105' : 'border-border hover:border-[var(--neon-blue)]'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Upload PDF file"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleInputChange}
                aria-hidden="true"
              />
              
              <div className="mb-6">
                <svg className="w-16 h-16 mx-auto text-[var(--neon-blue)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              
              <h3 className="text-xl font-semibold mb-2 text-foreground">Drop your PDF here</h3>
              <p className="text-muted-foreground mb-4">or click to browse your files</p>
              
              <div className="inline-flex items-center gap-4 text-sm text-muted-foreground font-mono">
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Looks for specific headers
                </span>
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Secure & Private
                </span>
              </div>
            </div>
          </section>
        )}

        {/* Processing Section */}
        {view === 'processing' && fileInfo && (
          <section className="mb-8 fade-in">
            <div className="glass rounded-2xl p-6 mb-6 border border-border">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[var(--neon-purple)]/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-[var(--neon-purple)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold truncate text-foreground">{fileInfo.name}</h4>
                  <p className="text-sm text-muted-foreground font-mono">{fileInfo.size}</p>
                </div>
                <button onClick={resetApp} className="p-2 rounded-lg hover:bg-secondary transition-colors" aria-label="Remove file">
                  <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-muted-foreground">Processing...</span>
                <span className="text-sm font-medium font-mono text-foreground">{Math.round(progress)}%</span>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div className="h-full rounded-full bg-[var(--neon-blue)] transition-all duration-300 shadow-[0_0_15px_var(--neon-blue)]" style={{ width: `${progress}%` }}></div>
              </div>
              <p className="text-xs text-muted-foreground mt-2 font-mono">{statusText}</p>
            </div>
          </section>
        )}

        {/* Results Section */}
        {view === 'results' && (
          <section className="fade-in">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Pages', value: stats.pages },
                { label: 'Tables Found', value: stats.tables },
                { label: 'Data Rows', value: stats.rows },
                { label: 'Total Cells', value: stats.cells },
              ].map((stat) => (
                <div key={stat.label} className="glass rounded-xl p-4 text-center border border-border">
                  <p className="text-2xl font-bold text-[var(--neon-blue)]">{stat.value.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Preview - All Values */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">
                    Data Preview 
                    {isStructured && <span className="text-sm font-normal text-[var(--neon-green)] ml-2">(Structured)</span>}
                </h3>
                <span className="text-sm text-muted-foreground font-mono">
                  {extractedData.length - 1} rows
                </span>
              </div>
              <div className="glass rounded-xl overflow-hidden border border-border">
                <div className="max-h-[600px] overflow-y-auto overflow-x-auto">
                    <table className="w-full text-sm text-left text-foreground">
                    <thead className="text-xs uppercase bg-secondary/50 text-secondary-foreground sticky top-0">
                        <tr>
                        {extractedData[0]?.map((header, i) => (
                            <th key={i} className="px-4 py-3 whitespace-nowrap">{header}</th>
                        ))}
                        </tr>
                    </thead>
                    <tbody>
                        {extractedData.slice(1).map((row, i) => (
                        <tr key={i} className="border-t border-border hover:bg-secondary/30 transition-colors">
                            {row.map((cell, j) => (
                            <td key={j} className="px-4 py-3 whitespace-nowrap">{cell || '-'}</td>
                            ))}
                        </tr>
                        ))}
                    </tbody>
                    </table>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-4">
              <button onClick={downloadExcel} className="flex-1 px-6 py-4 rounded-xl font-semibold flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-lg shadow-primary/20">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Excel File
              </button>
              <button onClick={resetApp} className="px-6 py-4 rounded-xl font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors">
                Convert Another File
              </button>
            </div>
          </section>
        )}

        {/* Error Section */}
        {view === 'error' && (
          <section className="fade-in">
            <div className="glass rounded-2xl p-6 text-center border border-destructive">
              <svg className="w-12 h-12 mx-auto mb-4 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3 className="text-xl font-semibold mb-2 text-foreground">Conversion Failed</h3>
              <p className="text-muted-foreground mb-4">{errorMessage}</p>
              <button onClick={resetApp} className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors">
                Try Again
              </button>
            </div>
          </section>
        )}

        {/* Features */}
        <section className="mt-16 fade-in stagger-3">
          <h2 className="text-2xl font-bold text-center mb-8 text-foreground">Smart Extraction Logic</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { title: 'Header Detection', desc: 'Scans pages to find the specific row containing Date, Description, Rate, Quantity, and Amount.' },
              { title: 'Data Cleaning', desc: 'Automatically removes headers, footers, and non-tabular content above the main data.' },
              { title: 'Column Mapping', desc: 'Maps extracted data to the correct columns, even if they appear in different orders in the PDF.' },
            ].map((feature, index) => (
              <div key={index} className="glass rounded-xl p-6 border border-border hover:border-[var(--neon-blue)] transition-colors">
                <div className="w-10 h-10 rounded-lg bg-[var(--neon-blue)]/10 flex items-center justify-center mb-4">
                  <span className="text-[var(--neon-blue)] font-bold">{index + 1}</span>
                </div>
                <h3 className="font-semibold mb-2 text-foreground">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-16 text-center text-sm text-muted-foreground">
          <p>All processing happens locally in your browser. Your files are never uploaded to any server.</p>
        </footer>
      </div>
    </main>
  );
}