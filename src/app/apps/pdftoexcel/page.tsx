'use client';

import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
// importing the legacy build fixes the "Module not found" and SSR issues in Next.js
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';

// Set the worker source. You can use the CDN link or the local file if you copied it.
// Using the CDN link matching the legacy build version is often easiest for deployment.
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

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
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    try {
      // Using the imported library directly
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      const numPages = pdf.numPages;
      let allTables: TableData[] = [];
      let totalRows = 0;
      let totalCells = 0;

      updateProgress(10, `Found ${numPages} pages, extracting content...`);

      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        updateProgress(10 + (i / numPages) * 60, `Processing page ${i} of ${numPages}...`);
        
        const tables = extractTablesFromText(textContent.items, i);
        if (tables.length > 0) {
          allTables = allTables.concat(tables);
          tables.forEach(table => {
            totalRows += table.data.length;
            totalCells += table.data.reduce((sum, row) => sum + row.length, 0);
          });
        }
      }

      updateProgress(80, 'Structuring data...');

      if (allTables.length === 0) {
        throw new Error('No tables found in this PDF. The PDF may contain scanned images or non-tabular data.');
      }

      let combinedData: string[][] = [];
      allTables.forEach((table, index) => {
        if (index > 0) combinedData.push([]); 
        combinedData = combinedData.concat(table.data);
      });

      updateProgress(100, 'Complete!');
      
      setExtractedData(combinedData);
      setStats({ pages: numPages, tables: allTables.length, rows: totalRows, cells: totalCells });
      
      setTimeout(() => setView('results'), 500);

    } catch (error: any) {
      console.error('Error processing PDF:', error);
      setErrorMessage(error.message || 'Failed to process PDF file');
      setView('error');
    }
  };

  const extractTablesFromText = (items: any[], pageNum: number): TableData[] => {
    const rows = new Map<number, any[]>();
    
    items.forEach(item => {
      if (!('str' in item) || !item.str.trim()) return;
      const yKey = Math.round(item.transform[5] / 5) * 5;
      if (!rows.has(yKey)) rows.set(yKey, []);
      rows.get(yKey)!.push({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width
      });
    });

    const sortedRows = Array.from(rows.entries())
      .sort((a, b) => b[0] - a[0])
      .map(entry => entry[1].sort((a, b) => a.x - b.x));

    if (sortedRows.length < 2) return [];

    const columnPositions = detectColumns(sortedRows);
    if (columnPositions.length < 2) return [];

    const tableData = sortedRows.map(row => {
      const cells = new Array(columnPositions.length).fill('');
      row.forEach((item: any) => {
        let colIndex = 0;
        let minDist = Infinity;
        columnPositions.forEach((pos, idx) => {
          const dist = Math.abs(item.x - pos);
          if (dist < minDist) {
            minDist = dist;
            colIndex = idx;
          }
        });
        cells[colIndex] = cells[colIndex] ? cells[colIndex] + ' ' + item.text : item.text;
      });
      return cells.map(c => c.trim());
    });

    const filteredData = tableData.filter(row => row.some(cell => cell.length > 0));
    if (filteredData.length < 2) return [];

    return [{ page: pageNum, data: filteredData, columns: columnPositions.length }];
  };

  const detectColumns = (rows: any[]) => {
    const xPositions: number[] = [];
    rows.forEach(row => row.forEach((item: any) => xPositions.push(item.x)));
    if (xPositions.length === 0) return [];
    
    xPositions.sort((a, b) => a - b);
    const columns: number[] = [];
    let currentCluster = [xPositions[0]];
    const threshold = 20;

    for (let i = 1; i < xPositions.length; i++) {
      if (xPositions[i] - xPositions[i - 1] < threshold) {
        currentCluster.push(xPositions[i]);
      } else {
        columns.push(currentCluster.reduce((a, b) => a + b, 0) / currentCluster.length);
        currentCluster = [xPositions[i]];
      }
    }
    columns.push(currentCluster.reduce((a, b) => a + b, 0) / currentCluster.length);
    return columns;
  };

  const updateProgress = (percent: number, status: string) => {
    setProgress(percent);
    setStatusText(status);
  };

  const downloadExcel = () => {
    if (extractedData.length === 0) return;
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(extractedData);
    
    const colWidths: number[] = [];
    extractedData.forEach(row => {
      row.forEach((cell, i) => {
        const len = (cell || '').toString().length;
        colWidths[i] = Math.max(colWidths[i] || 10, len + 2);
      });
    });
    ws['!cols'] = colWidths.map(w => ({ wch: Math.min(w, 50) }));

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
    <main className="relative z-10 min-h-screen px-4 py-8 md:py-12">
      <div className="max-w-5xl mx-auto">
        
        {/* Header */}
        <header className="text-center mb-12 fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-white/10 mb-6">
            <span className="w-2 h-2 rounded-full bg-[var(--neon-blue)] animate-pulse"></span>
            <span className="text-sm text-slate-300 font-mono">• No Upload Limits • Client-Side Processing</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-4 tracking-tight text-white">
            PDF to Excel<br />
            <span className="text-[var(--neon-blue)] text-glow">Converter</span>
          </h1>
          <p className="text-slate-300 text-lg max-w-xl mx-auto">
            Extract tables from PDF files and convert them to Excel spreadsheets. 
            All processing happens in your browser - your files never leave your device.
          </p>
        </header>

        {/* Upload Section */}
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
              <p className="text-slate-400 mb-4">or click to browse your files</p>
              
              <div className="inline-flex items-center gap-4 text-sm text-slate-400 font-mono">
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4 text-[var(--neon-green)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  PDF files only
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

        {/* Processing Section */}
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

        {/* Results Section */}
        {view === 'results' && (
          <section className="fade-in">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Pages', value: stats.pages },
                { label: 'Tables Found', value: stats.tables },
                { label: 'Rows', value: stats.rows },
                { label: 'Cells', value: stats.cells },
              ].map((stat) => (
                <div key={stat.label} className="glass rounded-xl p-4 text-center border border-white/10">
                  <p className="text-2xl font-bold text-[var(--neon-blue)]">{stat.value.toLocaleString()}</p>
                  <p className="text-xs text-slate-400 uppercase tracking-wider">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Preview */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Data Preview</h3>
                <span className="text-sm text-slate-400 font-mono">
                  Showing first 10 rows
                </span>
              </div>
              <div className="glass rounded-xl overflow-hidden overflow-x-auto border border-white/10">
                <table className="w-full text-sm text-left text-white">
                  <thead className="text-xs uppercase bg-white/5 text-slate-300 sticky top-0 backdrop-blur-sm">
                    <tr>
                      {extractedData[0]?.map((_, i) => (
                        <th key={i} className="px-4 py-3">Column {i + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {extractedData.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                        {row.map((cell, j) => (
                          <td key={j} className="px-4 py-3 whitespace-nowrap text-slate-200">{cell || ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Actions */}
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

        {/* Error Section */}
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

        {/* Features */}
        <section className="mt-16 fade-in stagger-3">
          <h2 className="text-2xl font-bold text-center mb-8 text-white text-glow">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { title: 'Upload PDF', desc: 'Drag and drop or select your PDF file containing tables you want to extract.' },
              { title: 'Auto Detection', desc: 'Our algorithm analyzes the document structure and identifies tabular data automatically.' },
              { title: 'Download Excel', desc: 'Get your data in a clean Excel file ready for editing, analysis, or reporting.' },
            ].map((feature, index) => (
              <div key={index} className="glass rounded-xl p-6 border border-white/10 hover:border-[var(--neon-blue)]/50 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-[var(--neon-blue)]/10 flex items-center justify-center mb-4">
                  <span className="text-[var(--neon-blue)] font-bold">{index + 1}</span>
                </div>
                <h3 className="font-semibold mb-2 text-white">{feature.title}</h3>
                <p className="text-sm text-slate-300">{feature.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-16 text-center text-sm text-slate-500">
          <p>All processing happens locally in your browser. Your files are never uploaded to any server.</p>
        </footer>
      </div>
    </main>
  );
}