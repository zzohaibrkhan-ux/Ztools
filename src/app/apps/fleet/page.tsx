'use client';

import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';

// Types
type ViewState = 'upload' | 'processing' | 'results' | 'error';
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
  
  const [prepayData, setPrepayData] = useState<string[][]>([]);
  const [reconData, setReconData] = useState<string[][]>([]);
  const [summaryData, setSummaryData] = useState<string[][]>([]);
  
  const [stats, setStats] = useState<Stats>({ pages: 0, tables: 0, rows: 0, cells: 0 });
  const [errorMessage, setErrorMessage] = useState('');
  const [isStructured, setIsStructured] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Configuration Table 1: Pre-payment Details ---
  const PREPAY_HEADER_CONFIG = [
    { key: 'description', aliases: ['description', 'desc', 'item description'] },
    { key: 'active days', aliases: ['active days', 'days', 'act days'] },
    { key: 'prepaid quantity', aliases: ['prepaid quantity', 'quantity', 'qty'] },
    { key: 'monthly rate', aliases: ['monthly rate', 'rate', 'monthly rates'] },
    { key: 'prepaid amount', aliases: ['prepaid amount', 'amount', 'amt', 'prepaid amt'] }
  ];
  const PREPAY_TARGET_HEADERS = PREPAY_HEADER_CONFIG.map(h => h.key);

  // --- Configuration Table 2: Prior Month Recon ---
  const RECON_HEADER_CONFIG = [
    { key: 'description', aliases: ['description', 'desc'] },
    { key: 'active days', aliases: ['active days', 'days'] },
    { key: 'prepaid quantity', aliases: ['prepaid', 'prepaid quantity'] },
    { key: 'actual quantity', aliases: ['actual', 'actual quantity'] },
    { key: 'reconciled quantity', aliases: ['reconciled', 'reconciled quantity'] },
    { key: 'monthly rate', aliases: ['monthly rate', 'rate'] },
    { key: 'reconciliation amount', aliases: ['reconciliation', 'reconciliation amount'] }
  ];
  const RECON_TARGET_HEADERS = RECON_HEADER_CONFIG.map(h => h.key);

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
    setPrepayData([]);
    setReconData([]);
    setSummaryData([]);

    try {
      const pdfjsLib = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      const numPages = pdf.numPages;
      
      // --- STATE MACHINE ---
      // Phases: summary_1 -> summary_2 -> summary_3 -> prepay -> recon -> done
      let mode = 'search_summary_1';
      
      // Data Buffers
      let summaryRows: string[][] = [];
      let prepayRows: string[][] = [];
      let reconRows: string[][] = [];
      
      // Temporary buffers for specific tables
      let summaryTable1: string[][] = [];
      let summaryTable2: string[][] = [];
      let summaryTable3: string[][] = [];

      // Header Maps
      let prepayHeaderMap: { [key: string]: number } | null = null;
      let reconHeaderMap: { [key: string]: number } | null = null;

      updateProgress(10, `Phase 1: Processing Summary...`);

      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Update progress based on mode
        if (mode.startsWith('search_summary') || mode.startsWith('extract_summary')) {
            updateProgress(10 + (i / numPages) * 30, `Phase 1: Scanning Summary (Page ${i})...`);
        } else if (mode === 'prepay') {
            updateProgress(40 + (i / numPages) * 30, `Phase 2: Pre-payment Details (Page ${i})...`);
        } else if (mode === 'recon') {
            updateProgress(70 + (i / numPages) * 20, `Phase 3: Recon Details (Page ${i})...`);
        }
        
        const rawRows = extractRawRows(textContent.items);

        for (let r = 0; r < rawRows.length; r++) {
          const row = rawRows[r];
          const rowText = row.join(' ').toLowerCase();

          // --- SUMMARY LOGIC ---
          
          // 1. Search Summary Table 1
          if (mode === 'search_summary_1') {
             if (rowText.includes('prepayment for current month')) {
                 mode = 'extract_summary_1';
                 // Add header for Summary Table 1
                 summaryTable1.push(['PREPAYMENT FOR CURRENT MONTH', 'Amount']);
             }
          }
          // Extract Summary Table 1
          else if (mode === 'extract_summary_1') {
             if (rowText.includes('reconciliation for prior month')) {
                 // Finish Table 1, Start Table 2
                 mode = 'extract_summary_2';
                 summaryTable2.push(['RECONCILIATION FOR PRIOR MONTH', 'Amount']);
             } else {
                 // Capture data: assume first part is desc, last part is amount
                 const { desc, amt } = parseSummaryRow(row);
                 if (desc || amt) summaryTable1.push([desc, amt]);
             }
          }
          // Extract Summary Table 2
          else if (mode === 'extract_summary_2') {
              if (rowText.includes('total')) {
                  // Finish Table 2, Start Table 3
                  mode = 'extract_summary_3';
                  summaryTable3.push(['TOTAL', 'Amount']);
              } else {
                  const { desc, amt } = parseSummaryRow(row);
                  if (desc || amt) summaryTable2.push([desc, amt]);
              }
          }
          // Extract Summary Table 3
          else if (mode === 'extract_summary_3') {
              if (rowText.includes('invoice')) {
                  // Finish Summary Phase, move to Prepay
                  mode = 'prepay'; 
                  
                  // Compile Summary Sheet
                  summaryRows = [...summaryTable1];
                  summaryRows.push([], []); // Gap
                  summaryRows = summaryRows.concat(summaryTable2);
                  summaryRows.push([], []); // Gap
                  summaryRows = summaryRows.concat(summaryTable3);
              } else {
                  const { desc, amt } = parseSummaryRow(row);
                  if (desc || amt) summaryTable3.push([desc, amt]);
              }
          }

          // --- DETAILED TABLES LOGIC ---

          // Pre-pay Processing
          else if (mode === 'prepay') {
              if (!prepayHeaderMap) {
                  const map = detectHeaderRow(row, PREPAY_HEADER_CONFIG, 4);
                  if (map) {
                      prepayHeaderMap = map;
                      prepayRows.push(['Description', 'Active Days', 'Prepaid Quantity', 'Monthly Rate', 'Prepaid Amount']);
                      continue;
                  }
              }
              
              if (prepayHeaderMap) {
                  const { extracted, stop } = processPrepayRows([row], prepayHeaderMap);
                  prepayRows = prepayRows.concat(extracted);
                  if (stop) {
                      mode = 'recon';
                      prepayHeaderMap = null; // Reset for safety
                  }
              }
          }

          // Recon Processing
          else if (mode === 'recon') {
              if (!reconHeaderMap) {
                  const map = detectHeaderRow(row, RECON_HEADER_CONFIG, 5);
                  if (map) {
                      reconHeaderMap = map;
                      reconRows.push(['Description', 'Active Days', 'Prepaid Quantity', 'Actual Quantity', 'Reconciled Quantity', 'Monthly Rate', 'Reconciliation Amount']);
                      continue;
                  }
              }

              if (reconHeaderMap) {
                  const { extracted } = processReconRows([row], reconHeaderMap);
                  reconRows = reconRows.concat(extracted);
              }
          }
        }
        
        // Optimization: If we are done with everything, we could break, 
        // but usually we scan whole doc just in case. Keeping loop for safety.
      }

      updateProgress(90, 'Finalizing data...');

      // --- Finalize Data ---
      
      let isAnyStructured = false;

      if (summaryRows.length > 0) {
        // Clean summary rows? usually not needed for summary.
        setSummaryData(summaryRows);
        isAnyStructured = true;
      }

      if (prepayRows.length > 1) {
        prepayRows = cleanData(prepayRows);
        setPrepayData(prepayRows);
        isAnyStructured = true;
      }

      if (reconRows.length > 1) {
        reconRows = cleanData(reconRows);
        setReconData(reconRows);
        isAnyStructured = true;
      }

      if (!isAnyStructured) {
         throw new Error('No tables found. Please check PDF structure.');
      }

      setIsStructured(isAnyStructured);
      
      const totalRows = Math.max(0, summaryRows.length) + 
                        Math.max(0, prepayRows.length - 1) + 
                        Math.max(0, reconRows.length - 1);
                        
      const totalCells = summaryRows.reduce((s, r) => s + r.length, 0) + 
                         prepayRows.reduce((s, r) => s + r.length, 0) + 
                         reconRows.reduce((s, r) => s + r.length, 0);

      // Tables count: Summary counts as 1 (containing 3 parts) + Prepay + Recon
      setStats({ 
        pages: numPages, 
        tables: (summaryRows.length > 0 ? 1 : 0) + (prepayRows.length > 1 ? 1 : 0) + (reconRows.length > 1 ? 1 : 0), 
        rows: totalRows, 
        cells: totalCells
      });
      
      updateProgress(100, 'Complete!');
      setTimeout(() => setView('results'), 500);

    } catch (error: any) {
      console.error('Error processing PDF:', error);
      setErrorMessage(error.message || 'Failed to process PDF file');
      setView('error');
    }
  };

  // --- Helper: Parse Summary Row ---
  const parseSummaryRow = (row: string[]) => {
    // Simple logic: Last numeric looking value is Amount, rest is Description
    let amtIdx = -1;
    for (let i = row.length - 1; i >= 0; i--) {
        if (looksLikeAmount(row[i])) {
            amtIdx = i;
            break;
        }
    }
    
    if (amtIdx === -1) {
        return { desc: row.join(' '), amt: '' };
    }
    
    const desc = row.slice(0, amtIdx).join(' ');
    const amt = row[amtIdx];
    return { desc, amt };
  };

  // --- Helper Functions ---

  const cleanData = (data: string[][]): string[][] => {
    return data.filter((row, index) => {
      if (index === 0) return true;
      const hasContent = row.some(cell => cell.trim() !== '');
      const isTotalRow = row[0]?.toLowerCase().includes('total');
      return hasContent && !isTotalRow;
    });
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

  const detectHeaderRow = (row: string[], config: any[], threshold: number): { [key: string]: number } | null => {
    const lowerRow = row.map(cell => cell.toLowerCase());
    const map: { [key: string]: number } = {};
    let foundCount = 0;

    config.forEach(headerConfig => {
      for (const alias of headerConfig.aliases) {
        const index = lowerRow.findIndex(cellText => cellText.includes(alias));
        if (index !== -1) {
          map[headerConfig.key] = index;
          foundCount++;
          break; 
        }
      }
    });

    if (foundCount >= threshold) {
      return map;
    }
    return null;
  };

  const looksLikeAmount = (val: string) => {
    if (!val) return false;
    const cleanVal = val.replace(/[$,]/g, '').trim();
    return !isNaN(parseFloat(cleanVal)) && isFinite(parseFloat(cleanVal));
  };

  const isEmpty = (val: string) => !val || val.trim() === '';

  // --- EXACT Logic for Table 1 (Prepay) ---
  const processPrepayRows = (rows: string[][], map: { [key: string]: number }): { extracted: string[][], stop: boolean } => {
    const extracted: string[][] = [];

    for (const row of rows) {
      const rowText = row.join(' ').toLowerCase();
      
      if (rowText.includes('reconciliation for prior month')) {
          const hasNumbers = row.some(cell => looksLikeAmount(cell));
          if (!hasNumbers) {
             return { extracted, stop: true };
          }
      }

      const newRow = PREPAY_TARGET_HEADERS.map(header => {
        const idx = map[header]; 
        return (idx !== undefined && row[idx]) ? row[idx].trim() : '';
      });

      const nonEmptyIndices: number[] = [];
      newRow.forEach((cell, index) => {
        if (!isEmpty(cell)) nonEmptyIndices.push(index);
      });

      if (nonEmptyIndices.length === 0) continue;

      const isHeaderRepeat = newRow.every((cell, i) => 
        cell.toLowerCase().includes(PREPAY_TARGET_HEADERS[i])
      );
      if (isHeaderRepeat) continue;

      // --- SINGLE VALUE LOGIC ---
      if (nonEmptyIndices.length === 1) {
        const colIndex = nonEmptyIndices[0];
        const val = newRow[colIndex];

        if (val.toLowerCase().includes('week')) {
            extracted.push(newRow);
            continue;
        }

        if (colIndex !== 4 && looksLikeAmount(val)) {
            const fixedRow = ['', '', '', '', val]; 
            extracted.push(fixedRow);
            continue;
        }

        if (colIndex === 0) {
            if (extracted.length > 0) {
                const lastRow = extracted[extracted.length - 1];
                lastRow[0] = (lastRow[0] + ' ' + val).replace(/\s+/g, ' ').trim();
            } else {
                extracted.push(newRow);
            }
            continue;
        }

        if (colIndex === 4) {
            extracted.push(newRow);
            continue;
        }
        
        extracted.push(newRow);
        continue;
      }

      // --- MULTI-VALUE ROWS ---
      const areAllButAmountEmpty = isEmpty(newRow[0]) && isEmpty(newRow[1]) && isEmpty(newRow[2]) && isEmpty(newRow[3]);
      if (areAllButAmountEmpty && !isEmpty(newRow[4])) {
          extracted.push(newRow);
          continue;
      }

      extracted.push(newRow);
    }

    return { extracted, stop: false };
  };

  // --- Adapted Logic for Table 2 (Recon) ---
  const processReconRows = (rows: string[][], map: { [key: string]: number }): { extracted: string[][], stop: boolean } => {
    const extracted: string[][] = [];

    for (const row of rows) {
      const rowText = row.join(' ').toLowerCase();

      const newRow = RECON_TARGET_HEADERS.map(header => {
        const idx = map[header]; 
        return (idx !== undefined && row[idx]) ? row[idx].trim() : '';
      });

      const nonEmptyIndices: number[] = [];
      newRow.forEach((cell, index) => {
        if (!isEmpty(cell)) nonEmptyIndices.push(index);
      });

      if (nonEmptyIndices.length === 0) continue;

      const isHeaderRepeat = newRow.every((cell, i) => 
        cell.toLowerCase().includes(RECON_TARGET_HEADERS[i])
      );
      if (isHeaderRepeat) continue;

      // --- SINGLE VALUE LOGIC ---
      if (nonEmptyIndices.length === 1) {
        const colIndex = nonEmptyIndices[0];
        const val = newRow[colIndex];

        if (val.toLowerCase().includes('week')) {
            extracted.push(newRow);
            continue;
        }

        if (colIndex !== 6 && looksLikeAmount(val)) {
            const fixedRow = ['', '', '', '', '', '', val]; 
            extracted.push(fixedRow);
            continue;
        }

        if (colIndex === 0) {
            if (extracted.length > 0) {
                const lastRow = extracted[extracted.length - 1];
                lastRow[0] = (lastRow[0] + ' ' + val).replace(/\s+/g, ' ').trim();
            } else {
                extracted.push(newRow);
            }
            continue;
        }

        if (colIndex === 6) {
            extracted.push(newRow);
            continue;
        }
        
        extracted.push(newRow);
        continue;
      }

      // --- MULTI-VALUE ROWS ---
      const areAllButAmountEmpty = newRow.every((cell, index) => {
          return index === 6 ? true : isEmpty(cell);
      });

      if (areAllButAmountEmpty && !isEmpty(newRow[6])) {
          extracted.push(newRow);
          continue;
      }

      extracted.push(newRow);
    }

    return { extracted, stop: false };
  };

  const updateProgress = (percent: number, status: string) => {
    setProgress(percent);
    setStatusText(status);
  };

  const parseNumber = (val: string): number => {
    if (!val) return 0;
    const cleanStr = val.toString().replace(/[$,]/g, '').trim();
    const num = parseFloat(cleanStr);
    return isNaN(num) ? 0 : num;
  };

  const downloadExcel = () => {
    if (summaryData.length === 0 && prepayData.length === 0 && reconData.length === 0) return;
    const wb = XLSX.utils.book_new();
    
    const currencyFormat = '"$"#,##0.00';
    const numberFormat = '#,##0';

    // --- Sheet 0: Summary ---
    if (summaryData.length > 0) {
        const wsSum = XLSX.utils.aoa_to_sheet(summaryData);
        // Basic formatting for Summary
        wsSum['!cols'] = [{ wch: 40 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, wsSum, 'Summary');
    }

    // --- Sheet 1: Pre-payment Details ---
    if (prepayData.length > 0) {
      const ws1 = XLSX.utils.aoa_to_sheet(prepayData);
      formatSheet(ws1, prepayData[0].length, [1, 2], [3, 4]); 
      XLSX.utils.book_append_sheet(wb, ws1, 'Pre-payment Details');
    }

    // --- Sheet 2: Prior Month Recon ---
    if (reconData.length > 0) {
      const ws2 = XLSX.utils.aoa_to_sheet(reconData);
      formatSheet(ws2, reconData[0].length, [1, 2, 3, 4], [5, 6]); 
      XLSX.utils.book_append_sheet(wb, ws2, 'Prior Month Recon');
    }

    const fileName = fileInfo?.name.replace('.pdf', '') || 'document';
    XLSX.writeFile(wb, `${fileName}_converted.xlsx`);
  };

  const formatSheet = (ws: XLSX.WorkSheet, colCount: number, numIndices: number[], currIndices: number[]) => {
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    const currencyFormat = '"$"#,##0.00';

    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      numIndices.forEach(idx => {
        const addr = XLSX.utils.encode_cell({ r: R, c: idx });
        if (ws[addr]) {
          ws[addr].t = 'n';
          ws[addr].v = parseNumber(ws[addr].v as string);
        }
      });

      currIndices.forEach(idx => {
        const addr = XLSX.utils.encode_cell({ r: R, c: idx });
        if (ws[addr]) {
          ws[addr].t = 'n';
          ws[addr].v = parseNumber(ws[addr].v as string);
          ws[addr].z = currencyFormat;
        }
      });
    }

    const widths = [{ wch: 40 }];
    for(let i = 1; i < colCount; i++) widths.push({ wch: 15 });
    ws['!cols'] = widths;
  };

  const resetApp = () => {
    setView('upload');
    setFileInfo(null);
    setProgress(0);
    setPrepayData([]);
    setReconData([]);
    setSummaryData([]);
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

  const prepayLen = prepayData.length > 0 ? prepayData.length - 1 : 0;
  const reconLen = reconData.length > 0 ? reconData.length - 1 : 0;
  const summaryLen = summaryData.length;

  return (
    <main className="relative z-10 min-h-screen px-4 py-8 md:py-12">
      <div className="max-w-5xl mx-auto">
        
        <header className="text-center mb-12 fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-white/10 mb-6">
            <span className="w-2 h-2 rounded-full bg-[var(--neon-blue)] animate-pulse"></span>
            <span className="text-sm text-slate-300 font-mono">• Triple Phase Processing • Auto Formatting</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-4 tracking-tight text-white">
            PDF to Excel<br />
            <span className="text-[var(--neon-blue)] text-glow">Variable Invoice</span>
          </h1>
          <p className="text-slate-300 text-lg max-w-xl mx-auto">
            Extracts Summary, Pre-payment Details, and Recon tables sequentially.
          </p>
        </header>

        {view === 'upload' && (
          <section className="mb-8 fade-in stagger-1">
            <div
              className={`glass rounded-2xl p-8 md:p-12 text-center cursor-pointer border-2 border-dashed transition-all duration-300 ${
                isDragging ? 'border-[var(--neon-purple)] bg-[var(--neon-purple)]/10 scale-[1.02]' : 'border-white/10 hover:border-[var(--neon-blue)]'
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
              
              <h3 className="text-xl font-semibold mb-2 text-white">Drop your PDF here</h3>
              <p className="text-slate-400 mb-4">Supports Multi-Phase Table Extraction</p>
              
              <div className="inline-flex items-center gap-4 text-sm text-slate-400 font-mono">
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4 text-[var(--neon-green)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Flexible Headers
                </span>
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4 text-[var(--neon-purple)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Secure & Private
                </span>
              </div>
            </div>
          </section>
        )}

        {view === 'processing' && fileInfo && (
          <section className="mb-8 fade-in">
            <div className="glass rounded-2xl p-6 mb-6 border border-white/10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[var(--neon-purple)]/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-[var(--neon-purple)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold truncate text-white">{fileInfo.name}</h4>
                  <p className="text-sm text-slate-400 font-mono">{fileInfo.size}</p>
                </div>
                <button onClick={resetApp} className="p-2 rounded-lg hover:bg-white/10 transition-colors" aria-label="Remove file">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-slate-300">Processing...</span>
                <span className="text-sm font-medium font-mono text-white">{Math.round(progress)}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[var(--neon-blue)] to-[var(--neon-purple)] transition-all duration-300 shadow-[0_0_15px_var(--neon-blue)]" style={{ width: `${progress}%` }}></div>
              </div>
              <p className="text-xs text-slate-400 mt-2 font-mono">{statusText}</p>
            </div>
          </section>
        )}

        {view === 'results' && (
          <section className="fade-in">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Pages', value: stats.pages },
                { label: 'Tables Found', value: stats.tables },
                { label: 'Data Rows', value: stats.rows },
                { label: 'Total Cells', value: stats.cells },
              ].map((stat) => (
                <div key={stat.label} className="glass rounded-xl p-4 text-center border border-white/10">
                  <p className="text-2xl font-bold text-[var(--neon-blue)]">{stat.value.toLocaleString()}</p>
                  <p className="text-xs text-slate-400 uppercase tracking-wider">{stat.label}</p>
                </div>
              ))}
            </div>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Extraction Results</h3>
              </div>

              {summaryData.length > 0 && (
                 <div className="mb-8">
                    <h4 className="text-md font-medium text-slate-300 mb-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[var(--neon-yellow)]"></span>
                        Summary ({summaryLen} rows)
                    </h4>
                    <div className="glass rounded-xl overflow-hidden border border-white/10">
                        <div className="max-h-[300px] overflow-y-auto overflow-x-auto">
                            <table className="w-full text-sm text-left text-white">
                            <tbody>
                                {summaryData.map((row, i) => (
                                <tr key={i} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                                    {row.map((cell, j) => (
                                    <td key={j} className="px-4 py-3 whitespace-nowrap text-slate-200 font-mono">{cell || '-'}</td>
                                    ))}
                                </tr>
                                ))}
                            </tbody>
                            </table>
                        </div>
                    </div>
                </div>
              )}

              {prepayData.length > 1 && (
                <div className="mb-8">
                    <h4 className="text-md font-medium text-slate-300 mb-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[var(--neon-green)]"></span>
                        Pre-payment Details ({prepayLen} rows)
                    </h4>
                    <div className="glass rounded-xl overflow-hidden border border-white/10">
                        <div className="max-h-[300px] overflow-y-auto overflow-x-auto">
                            <table className="w-full text-sm text-left text-white">
                            <thead className="text-xs uppercase bg-white/5 text-slate-300 sticky top-0 backdrop-blur-sm">
                                <tr>
                                {prepayData[0]?.map((header, i) => (
                                    <th key={i} className="px-4 py-3 whitespace-nowrap font-semibold">{header}</th>
                                ))}
                                </tr>
                            </thead>
                            <tbody>
                                {prepayData.slice(1).map((row, i) => (
                                <tr key={i} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                                    {row.map((cell, j) => (
                                    <td key={j} className="px-4 py-3 whitespace-nowrap text-slate-200">{cell || '-'}</td>
                                    ))}
                                </tr>
                                ))}
                            </tbody>
                            </table>
                        </div>
                    </div>
                </div>
              )}

              {reconData.length > 1 && (
                 <div className="mb-8">
                    <h4 className="text-md font-medium text-slate-300 mb-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[var(--neon-purple)]"></span>
                        Prior Month Recon ({reconLen} rows)
                    </h4>
                    <div className="glass rounded-xl overflow-hidden border border-white/10">
                        <div className="max-h-[300px] overflow-y-auto overflow-x-auto">
                            <table className="w-full text-sm text-left text-white">
                            <thead className="text-xs uppercase bg-white/5 text-slate-300 sticky top-0 backdrop-blur-sm">
                                <tr>
                                {reconData[0]?.map((header, i) => (
                                    <th key={i} className="px-4 py-3 whitespace-nowrap font-semibold">{header}</th>
                                ))}
                                </tr>
                            </thead>
                            <tbody>
                                {reconData.slice(1).map((row, i) => (
                                <tr key={i} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                                    {row.map((cell, j) => (
                                    <td key={j} className="px-4 py-3 whitespace-nowrap text-slate-200">{cell || '-'}</td>
                                    ))}
                                </tr>
                                ))}
                            </tbody>
                            </table>
                        </div>
                    </div>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <button onClick={downloadExcel} className="flex-1 px-6 py-4 rounded-xl font-semibold flex items-center justify-center gap-2 bg-gradient-to-r from-[var(--neon-blue)] to-[var(--neon-purple)] text-white hover:opacity-90 transition-all shadow-lg shadow-[var(--neon-blue)]/20">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Excel File
              </button>
              <button onClick={resetApp} className="px-6 py-4 rounded-xl font-medium glass border border-white/10 text-white hover:bg-white/10 transition-colors">
                Convert Another File
              </button>
            </div>
          </section>
        )}

        {view === 'error' && (
          <section className="fade-in">
            <div className="glass rounded-2xl p-6 text-center border border-red-500/30 bg-red-500/5">
              <svg className="w-12 h-12 mx-auto mb-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3 className="text-xl font-semibold mb-2 text-white">Conversion Failed</h3>
              <p className="text-slate-300 mb-4">{errorMessage}</p>
              <button onClick={resetApp} className="px-6 py-3 rounded-xl bg-[var(--neon-purple)] text-white font-medium hover:bg-[var(--neon-purple)]/80 transition-colors">
                Try Again
              </button>
            </div>
          </section>
        )}

        <footer className="mt-16 text-center text-sm text-slate-500">
          <p>All processing happens locally in your browser. Your files are never uploaded to any server.</p>
        </footer>
      </div>
    </main>
  );
}