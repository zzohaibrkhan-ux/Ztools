'use client';

import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';

// Types
type ViewState = 'upload' | 'processing' | 'results' | 'error';
interface FileProcessingInfo {
  name: string;
  size: string;
  status: 'pending' | 'processing' | 'done' | 'error';
}
interface ColumnConfig {
  key: string;
  header: string;
  aliases: string[];
  required?: boolean;
  validation?: 'numeric';
}

// --- CONFIGURATION SECTION ---
const COLUMN_CONFIG: ColumnConfig[] = [
  { key: 'rowNum', header: '#', aliases: ['#', 'No.', 'Row'], required: true },
  { key: 'name', header: 'Name', aliases: ['Name', 'Driver Name', 'DA Name'], required: true },
  { key: 'transporterId', header: 'Transporter ID', aliases: ['Transporter ID', 'Transporter'], required: true },
  { key: 'delivered', header: 'Delivered', aliases: ['Delivered'], required: true, validation: 'numeric' },
  { key: 'ficoScore', header: 'Fico Score', aliases: ['Fico Score', 'FICO', 'Fico'], required: false },
  { key: 'seatbeltOffRate', header: 'Seatbelt Off Rate', aliases: ['Seatbelt Off Rate', 'Seatbelt-Off', 'Seatbelt'], required: false },
  { key: 'speedingEventRate', header: 'Speeding Event Rate', aliases: ['Speeding Event', 'Speeding'], required: false },
  { key: 'distractionsRate', header: 'Distractions Rate', aliases: ['Distractions Rate', 'Distractions'], required: false },
  { key: 'followingDistanceRate', header: 'Following Distance Rate', aliases: ['Following Distance', 'Following'], required: false },
  { key: 'signSignalViolationsRate', header: 'Sign/Signal Violations Rate', aliases: ['Sign/Signal', 'Sign/'], required: false },
  { key: 'cdfDpmo', header: 'CDF DPMO', aliases: ['CDF DPMO', 'CDF'], required: false },
  { key: 'ced', header: 'CED', aliases: ['CED'], required: false },
  { key: 'dcr', header: 'DCR', aliases: ['DCR'], required: false },
  { key: 'dsb', header: 'DSB', aliases: ['DSB'], required: false },
  { key: 'pod', header: 'POD', aliases: ['POD'], required: false },
  { key: 'psb', header: 'PSB', aliases: ['PSB'], required: false },
  { key: 'dsbCount', header: 'DSB Count', aliases: ['DSB Count'], required: false },
  { key: 'podOpps', header: 'POD Opps.', aliases: ['POD Opps', 'POD Opp'], required: false },
];

const SOURCE_FILE_COL = 'Source File';

interface ColumnBoundary {
  key: string;
  header: string;
  start: number;
  end: number;
}

export default function PDFTableExtractor() {
  const [view, setView] = useState<ViewState>('upload');
  const [files, setFiles] = useState<FileProcessingInfo[]>([]);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Initializing...');
  const [isDragging, setIsDragging] = useState(false);
  const [extractedData, setExtractedData] = useState<string[][]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    
    const fileArray = Array.from(fileList).filter(f => f.type === 'application/pdf');
    if (fileArray.length === 0) {
      setErrorMessage('Please upload valid PDF files.');
      setView('error');
      return;
    }

    const fileInfos: FileProcessingInfo[] = fileArray.map(f => ({
      name: f.name,
      size: formatFileSize(f.size),
      status: 'pending'
    }));

    setFiles(fileInfos);
    processFiles(fileArray, fileInfos);
  };

  const processFiles = async (fileArray: File[], initialFileInfos: FileProcessingInfo[]) => {
    setView('processing');
    setProgress(0);
    
    const pdfjsLib = await loadPdfJs();
    const masterData: string[][] = [];
    
    const headers = [SOURCE_FILE_COL, ...COLUMN_CONFIG.map(c => c.header)];
    masterData.push(headers);

    const totalFiles = fileArray.length;

    for (let i = 0; i < totalFiles; i++) {
      const file = fileArray[i];
      const fileName = file.name.replace('.pdf', '');
      
      setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'processing' } : f));
      setStatusText(`Processing file ${i + 1} of ${totalFiles}: ${file.name}...`);
      
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const numPages = pdf.numPages;

        for (let p = 1; p <= numPages; p++) {
          const page = await pdf.getPage(p);
          const textContent = await page.getTextContent();
          const result = extractTableDataWithCoords(textContent.items, fileName);
          
          if (result.length > 0) {
            masterData.push(...result);
          }
        }

        setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'done' } : f));

      } catch (err) {
        console.error(`Error processing ${file.name}:`, err);
        setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'error' } : f));
      }
      
      setProgress(((i + 1) / totalFiles) * 100);
    }

    setStatusText('Processing complete!');
    setExtractedData(masterData);
    
    if (masterData.length <= 1) {
      setErrorMessage('No tables found matching the specified columns in any file.');
      setView('error');
    } else {
      setTimeout(() => setView('results'), 500);
    }
  };

  // --- CORE LOGIC ---

  const mergeAdjacentItems = (items: any[], threshold = 8): any[] => {
    if (items.length === 0) return [];
    const sorted = [...items].sort((a, b) => a.x - b.x);
    const merged: any[] = [sorted[0]];
    
    for (let i = 1; i < sorted.length; i++) {
      const curr = sorted[i];
      const prev = merged[merged.length - 1];
      
      const prevWidth = prev.width || (prev.text.length * 6);
      const prevEnd = prev.x + prevWidth;
      
      if (curr.x - prevEnd < threshold) {
        prev.text += ' ' + curr.text;
        const currWidth = curr.width || (curr.text.length * 6);
        prev.width = (curr.x + currWidth) - prev.x;
      } else {
        merged.push(curr);
      }
    }
    return merged;
  };

  const extractTableDataWithCoords = (items: any[], sourceName: string): string[][] => {
    // 1. Group items by Y-coordinate
    const rowsMap = new Map<number, any[]>();
    
    items.forEach(item => {
      if (!('str' in item) || !item.str.trim()) return;
      const yKey = Math.round(item.transform[5] / 2) * 2; 
      if (!rowsMap.has(yKey)) rowsMap.set(yKey, []);
      rowsMap.get(yKey)!.push({
        text: item.str,
        x: item.transform[4],
        width: item.width
      });
    });

    // 2. Sort and Merge
    const sortedRows = Array.from(rowsMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(entry => {
        const sortedItems = entry[1].sort((a, b) => a.x - b.x);
        return mergeAdjacentItems(sortedItems, 8);
      });

    // 3. Find Header Row
    let columnBoundaries: ColumnBoundary[] = [];
    let headerFound = false;
    let dataStartIndex = -1;

    for (let i = 0; i < sortedRows.length; i++) {
      const row = sortedRows[i];
      const detected = detectHeaderRow(row);
      
      if (detected.length > 0) {
        const requiredKeys = COLUMN_CONFIG.filter(c => c.required).map(c => c.key);
        const allRequiredFound = requiredKeys.every(k => detected.some(d => d.key === k));

        if (allRequiredFound) {
          columnBoundaries = calculateMidpointBoundaries(detected);
          headerFound = true;
          dataStartIndex = i + 1;
          break;
        }
      }
    }

    if (!headerFound) return [];

    // 4. Extract Data
    const extracted: string[][] = [];
    
    for (let i = dataStartIndex; i < sortedRows.length; i++) {
      const rowItems = sortedRows[i];
      
      const rowObj: { [key: string]: string } = {};
      COLUMN_CONFIG.forEach(c => rowObj[c.key] = '');

      rowItems.forEach(item => {
        const col = findColumnForX_Midpoint(item.x, columnBoundaries);
        if (col) {
          if (rowObj[col.key].length > 0) rowObj[col.key] += ' ';
          rowObj[col.key] += item.text;
        }
      });

      // --- FIX # COLUMN MERGING ---
      if (rowObj['rowNum'] && rowObj['rowNum'].includes(' ')) {
        const parts = rowObj['rowNum'].split(' ');
        const potentialNum = parts[0];
        if (/^\d+$/.test(potentialNum)) {
          rowObj['rowNum'] = potentialNum;
          rowObj['name'] = parts.slice(1).join(' ') + ' ' + (rowObj['name'] || '');
          rowObj['name'] = rowObj['name'].trim();
        }
      }

      // --- SMART VALIDATION FOR DELIVERED ---
      if (rowObj.delivered && COLUMN_CONFIG.find(c => c.key === 'delivered')?.validation === 'numeric') {
        const parts = rowObj.delivered.split(' ');
        const numericParts: string[] = [];
        const textParts: string[] = [];
        
        parts.forEach(p => {
          if (/^-?\d+\.?\d*$/.test(p)) numericParts.push(p);
          else textParts.push(p);
        });

        if (textParts.length > 0 && numericParts.length > 0) {
          rowObj.delivered = numericParts.join(' ');
          const nextKey = 'ficoScore'; 
          if (nextKey) {
            rowObj[nextKey] = textParts.join(' ') + ' ' + rowObj[nextKey];
          }
        }
      }

      const rowNumVal = (rowObj['rowNum'] || '').trim();
      const nameVal = (rowObj['name'] || '').trim();
      const transIdVal = (rowObj['transporterId'] || '').trim();
      const deliveredVal = (rowObj['delivered'] || '').trim();

      // --- MERGE LOGIC (NAME) ---
      if (nameVal && !rowNumVal && !transIdVal && !deliveredVal) {
        if (extracted.length > 0) {
          const lastRow = extracted[extracted.length - 1];
          const nameIdx = COLUMN_CONFIG.findIndex(c => c.key === 'name');
          if (nameIdx !== -1) {
            const colIndex = nameIdx + 1;
            lastRow[colIndex] = (lastRow[colIndex] || '') + ' ' + nameVal;
          }
        }
        continue;
      }

      // --- MERGE LOGIC (TRANSPORTER ID) ---
      if (transIdVal && !rowNumVal && !nameVal && !deliveredVal) {
        if (extracted.length > 0) {
          const lastRow = extracted[extracted.length - 1];
          const transIdx = COLUMN_CONFIG.findIndex(c => c.key === 'transporterId');
          if (transIdx !== -1) {
            const colIndex = transIdx + 1;
            lastRow[colIndex] = (lastRow[colIndex] || '') + transIdVal;
          }
        }
        continue;
      }

      // --- EMPTY ROW LOGIC ---
      if (!rowNumVal && !nameVal && !transIdVal) {
        continue;
      }

      const rowData = [sourceName];
      COLUMN_CONFIG.forEach(col => {
        rowData.push(rowObj[col.key] || '');
      });
      extracted.push(rowData);
    }

    return extracted;
  };

  const detectHeaderRow = (row: any[]): { key: string; x: number }[] => {
    const detections: { key: string; x: number }[] = [];
    row.forEach(item => {
      const text = item.text.toLowerCase().trim();
      COLUMN_CONFIG.forEach(col => {
        const match = col.aliases.some(alias => text.startsWith(alias.toLowerCase()));
        if (match && !detections.some(d => d.key === col.key)) {
          detections.push({ key: col.key, x: item.x });
        }
      });
    });
    return detections;
  };

  const calculateMidpointBoundaries = (detections: { key: string; x: number }[]): ColumnBoundary[] => {
    const sorted = detections.sort((a, b) => a.x - b.x);
    const boundaries: ColumnBoundary[] = [];
    sorted.forEach((det, index) => {
      const currentX = det.x;
      const nextX = (index < sorted.length - 1) ? sorted[index + 1].x : Infinity;
      const prevX = (index > 0) ? sorted[index - 1].x : -Infinity;
      const config = COLUMN_CONFIG.find(c => c.key === det.key);
      if (config) {
        boundaries.push({
          key: det.key,
          header: config.header,
          start: (currentX + prevX) / 2,
          end: (currentX + nextX) / 2
        });
      }
    });
    return boundaries;
  };

  const findColumnForX_Midpoint = (x: number, boundaries: ColumnBoundary[]): ColumnBoundary | null => {
    for (const b of boundaries) {
      if (x >= b.start && x < b.end) return b;
    }
    if (boundaries.length > 0 && x < boundaries[0].start) return boundaries[0];
    return null;
  };

  // --- UI & Download Logic ---

  const downloadExcel = () => {
    if (extractedData.length === 0) return;
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(extractedData);
    const colWidths = extractedData[0].map((_, colIdx) => ({ wch: colIdx === 0 ? 30 : 20 }));
    ws['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws, 'Compiled Data');
    XLSX.writeFile(wb, `Extracted_PDF_Data_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const resetApp = () => {
    setView('upload');
    setFiles([]);
    setProgress(0);
    setExtractedData([]);
    setErrorMessage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFilesSelected(e.dataTransfer.files);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  // --- CALCULATION FOR SUMMARY CARDS ---
  const calculateDeliveredStats = () => {
    const stats = { total: 0, files: {} as Record<string, number> };
    if (extractedData.length <= 1) return stats;

    // Find column index for 'Delivered'
    const deliveredIdx = extractedData[0].indexOf('Delivered');
    if (deliveredIdx === -1) return stats;

    // Iterate data rows
    extractedData.slice(1).forEach(row => {
      const fileName = row[0]; // Source File is at index 0
      const val = parseInt(row[deliveredIdx], 10);
      if (!isNaN(val)) {
        stats.total += val;
        stats.files[fileName] = (stats.files[fileName] || 0) + val;
      }
    });
    return stats;
  };

  const deliveredStats = calculateDeliveredStats();

  return (
    <main className="relative z-10 min-h-screen px-4 py-8 md:py-12 bg-slate-950">
      <div className="max-w-5xl mx-auto">
        
        <header className="text-center mb-12 fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 mb-6 bg-white/5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-sm text-slate-300 font-mono">• Smart Summary Stats • Logic v3.0</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-4 tracking-tight text-white">
            DSP Scorecard<br />
            <span className="text-emerald-400 text-glow">Extractor</span>
          </h1>
          <p className="text-slate-300 text-lg max-w-xl mx-auto">
            Automatically calculates Total Delivered and Per-File breakdown.
          </p>
        </header>

        {view === 'upload' && (
          <section className="mb-8 fade-in">
            <div
              className={`rounded-2xl p-8 md:p-12 text-center cursor-pointer border-2 border-dashed transition-all duration-300 bg-slate-900/50 ${
                isDragging ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10 hover:border-emerald-500/50'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept=".pdf" multiple className="hidden" onChange={(e) => handleFilesSelected(e.target.files)} />
              <svg className="w-16 h-16 mx-auto text-emerald-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <h3 className="text-xl font-semibold mb-2 text-white">Drop your PDFs here</h3>
              <p className="text-slate-400 text-sm">(Multiple files supported)</p>
            </div>
          </section>
        )}

        {view === 'processing' && (
          <section className="mb-8 fade-in">
            <div className="rounded-2xl p-6 border border-white/10 bg-slate-900/50">
              <h4 className="text-lg font-semibold text-white mb-4">Processing Files</h4>
              <div className="space-y-3 mb-6">
                {files.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                    <div className={`w-2 h-2 rounded-full ${
                      file.status === 'done' ? 'bg-emerald-400' : 
                      file.status === 'processing' ? 'bg-yellow-400 animate-pulse' : 
                      file.status === 'error' ? 'bg-red-400' : 'bg-slate-500'
                    }`}></div>
                    <div className="flex-1 truncate text-slate-200">{file.name}</div>
                  </div>
                ))}
              </div>
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          </section>
        )}

        {view === 'results' && (
          <section className="fade-in">
            {/* Stats Grid - Now 4 columns */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-xl p-4 text-center border border-white/10 bg-slate-900/50">
                <p className="text-2xl font-bold text-emerald-400">{files.length}</p>
                <p className="text-xs text-slate-400">Files Processed</p>
              </div>
              <div className="rounded-xl p-4 text-center border border-white/10 bg-slate-900/50">
                <p className="text-2xl font-bold text-emerald-400">{extractedData.length - 1}</p>
                <p className="text-xs text-slate-400">Valid Rows</p>
              </div>
              <div className="rounded-xl p-4 text-center border border-white/10 bg-slate-900/50">
                <p className="text-2xl font-bold text-emerald-400">{COLUMN_CONFIG.length + 1}</p>
                <p className="text-xs text-slate-400">Columns Output</p>
              </div>
              {/* New Total Delivered Card */}
              <div className="rounded-xl p-4 text-center border border-emerald-500/30 bg-emerald-900/20">
                <p className="text-2xl font-bold text-white">{deliveredStats.total.toLocaleString()}</p>
                <p className="text-xs text-emerald-300">Total Delivered</p>
              </div>
            </div>

            {/* Sheet-wise Breakdown */}
            {Object.keys(deliveredStats.files).length > 0 && (
              <div className="mb-6 glass rounded-xl p-4 border border-white/10 bg-slate-900/50">
                <h4 className="text-sm font-semibold text-slate-300 mb-3">Delivered by File</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  {Object.entries(deliveredStats.files).map(([name, count]) => (
                    <div key={name} className="flex flex-col bg-slate-800/50 p-2 rounded border border-slate-700">
                      <span className="text-slate-400 truncate">{name}</span>
                      <span className="text-white font-bold text-sm mt-1">{count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-6 rounded-xl overflow-hidden border border-white/10 bg-slate-900/50">
              <div className="max-h-[500px] overflow-auto">
                <table className="w-full text-sm text-left text-white">
                  <thead className="text-xs uppercase bg-slate-800 text-slate-300 sticky top-0">
                    <tr>
                      {extractedData[0]?.map((header, i) => (
                        <th key={i} className="px-4 py-3 whitespace-nowrap font-semibold">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {extractedData.slice(1).map((row, i) => (
                      <tr key={i} className="border-t border-slate-800 hover:bg-slate-800/50">
                        {row.map((cell, j) => (
                          <td key={j} className="px-4 py-3 whitespace-nowrap">{cell || '-'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-4">
              <button onClick={downloadExcel} className="flex-1 px-6 py-4 rounded-xl font-semibold bg-emerald-600 text-white hover:bg-emerald-500 transition-colors">
                Download Excel
              </button>
              <button onClick={resetApp} className="px-6 py-4 rounded-xl font-medium border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors">
                Reset
              </button>
            </div>
          </section>
        )}

        {view === 'error' && (
          <div className="text-center p-8 bg-red-900/20 rounded-xl border border-red-500/30">
            <p className="text-red-400 mb-4">{errorMessage}</p>
            <button onClick={resetApp} className="px-6 py-2 bg-red-600 text-white rounded-lg">Try Again</button>
          </div>
        )}
      </div>
    </main>
  );
}