'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Upload, X, Settings, FileSpreadsheet } from 'lucide-react';
import Link from 'next/link';
import * as XLSX from 'xlsx';

// ============================================
// 1. UTILITY FUNCTIONS
// ============================================

// Helper to determine if a word is "Bad" data (DSP, Numeric, Blank)
const isDefaultExcluded = (word) => {
  // 1. Check Blank
  if (word === '__BLANK__') return true;
  
  // 2. Check Numeric
  // We check if the original string is a number
  if (!isNaN(Number(word)) && word.trim() !== '') return true;

  // 3. Check DSP Initiated
  if (word.toLowerCase().startsWith('dsp initiated work')) return true;

  return false;
};

const parseExcelFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
        resolve(jsonData);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

const extractFileInfo = (jsonData) => {
  const companyName = jsonData[1]?.[1] || 'Unknown Company';
  const stationName = jsonData[1]?.[2] || 'Unknown Station';
  return { companyName, stationName };
};

// Extract ALL unique words (no filtering applied here)
const extractUniqueWords = (jsonData) => {
  const uniqueWords = new Set();
  
  if (jsonData.length < 4) return [];

  for (let colIndex = 2; colIndex < jsonData[3]?.length; colIndex++) {
    for (let rowIndex = 4; rowIndex < jsonData.length; rowIndex++) {
      const cellValue = jsonData[rowIndex]?.[colIndex];
      
      let word = String(cellValue || '').trim();
      
      // Handle Blanks as a specific key
      if (word === '') {
        word = '__BLANK__';
      }
      
      uniqueWords.add(word);
    }
  }

  return Array.from(uniqueWords).sort();
};

// Process data based strictly on the Word Filter State
const processExcelData = (jsonData, wordFilterState) => {
  if (jsonData.length < 4) return { counts: [] };
  
  const dateRow = jsonData[3] || [];
  const counts = [];
  
  for (let colIndex = 2; colIndex < dateRow.length; colIndex++) {
    const dateValue = dateRow[colIndex];
    if (dateValue) {
      let count = 0;
      
      for (let rowIndex = 4; rowIndex < jsonData.length; rowIndex++) {
        const cellValue = jsonData[rowIndex]?.[colIndex];
        let word = String(cellValue || '').trim();
        if (word === '') word = '__BLANK__';

        // Logic: If word is in filter state, use that value. 
        // If not in filter state (shouldn't happen often), default to true (include).
        const isAllowed = wordFilterState[word] !== false;
        
        if (isAllowed) {
          count++;
        }
      }
      
      counts.push({
        date: formatDate(dateValue),
        rawDate: dateValue,
        column: colIndex,
        count
      });
    }
  }
  
  return { counts };
};

const formatDate = (dateValue) => {
  if (!dateValue) return 'N/A';
  if (dateValue instanceof Date && !isNaN(dateValue)) {
    return dateValue.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  const parsed = new Date(dateValue);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  return String(dateValue);
};

// Helper to format word for display
const formatWordLabel = (word) => {
  if (word === '__BLANK__') return '[Blank Cell]';
  return word;
};

// ============================================
// 2. COMPONENTS
// ============================================

const AnimatedBackground = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none">
    <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
    <motion.div
      className="absolute w-[600px] h-[600px] rounded-full opacity-20"
      style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.4) 0%, transparent 70%)', top: '-10%', right: '-10%' }}
      animate={{ x: [0, 50, 0], y: [0, 30, 0] }}
      transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
    />
    <motion.div
      className="absolute w-[500px] h-[500px] rounded-full opacity-15"
      style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.4) 0%, transparent 70%)', bottom: '-5%', left: '-5%' }}
      animate={{ x: [0, -40, 0], y: [0, -40, 0] }}
      transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
    />
  </div>
);

const CheckboxItem = ({ label, checked, onChange }) => (
  <div 
    onClick={onChange}
    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all select-none ${
      checked 
        ? 'bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-400' 
        : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'
    }`}
  >
    <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center border transition-colors ${
      checked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-500 bg-slate-900'
    }`}>
      {checked && (
        <motion.svg 
          initial={{ scale: 0 }} 
          animate={{ scale: 1 }} 
          className="w-3 h-3 text-white" 
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </motion.svg>
      )}
    </div>
    <div className="flex-1">
      <div className={`text-sm font-medium ${checked ? 'text-white' : 'text-slate-400'}`}>
        {label}
      </div>
    </div>
  </div>
);

const FilterConfigModal = ({ 
  isOpen, 
  onClose, 
  wordFilterState, 
  setWordFilterState,
  uniqueWords 
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const toggleWord = (word) => {
    setWordFilterState(prev => ({
      ...prev,
      [word]: prev[word] === undefined ? false : !prev[word]
    }));
  };

  const setAllVisible = (status) => {
    const newWordState = { ...wordFilterState };
    uniqueWords.forEach(word => {
      if (searchTerm === '' || word.includes(searchTerm.toLowerCase())) {
        newWordState[word] = status;
      }
    });
    setWordFilterState(newWordState);
  };

  const filteredWords = uniqueWords.filter(word => word.includes(searchTerm.toLowerCase()));

  if (!isOpen) return null;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-700 bg-slate-800/50">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-white">Filter Configuration</h2>
              <p className="text-sm text-slate-400 mt-1">Uncheck items to exclude them from the count.</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-2 hover:bg-slate-700 rounded-full">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          
          <div className="flex justify-between items-center gap-4">
             <input
              type="text"
              placeholder="Search words..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
            />
            <div className="flex gap-2 flex-shrink-0">
              <button 
                onClick={() => setAllVisible(true)}
                className="text-xs px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 transition-colors whitespace-nowrap"
              >
                Check All
              </button>
              <button 
                onClick={() => setAllVisible(false)}
                className="text-xs px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 transition-colors whitespace-nowrap"
              >
                Uncheck All
              </button>
            </div>
          </div>

          <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-2 space-y-1 max-h-96 overflow-y-auto">
            {filteredWords.length === 0 && uniqueWords.length > 0 ? (
              <p className="text-slate-500 text-sm text-center py-4">No words match search.</p>
            ) : uniqueWords.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-4">Upload a file to see words.</p>
            ) : (
              filteredWords.map(word => {
                // Default to true (checked) if not in state, UNLESS it's a default excluded type
                // But our initialization logic handles the default value, so we just read state.
                const isActive = wordFilterState[word] !== false; 
                return (
                  <CheckboxItem
                    key={word}
                    label={formatWordLabel(word)}
                    checked={isActive}
                    onChange={() => toggleWord(word)}
                  />
                );
              })
            )}
          </div>
          
          <p className="text-xs text-slate-500 italic">
            Note: Items like "DSP Initiated Work", Numbers, and Blanks are unchecked by default.
          </p>
        </div>

        <div className="p-4 bg-slate-800/50 border-t border-slate-700 flex justify-end">
          <motion.button
            onClick={onClose}
            className="px-6 py-2 bg-gradient-to-r from-emerald-600 to-cyan-600 rounded-lg text-white font-semibold shadow-lg"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Apply & Close
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
};

const UploadZone = ({ onFilesSelected, isDragging, setIsDragging }) => {
  const fileInputRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.match(/\.(xlsx|xls)$/));
    if (files.length > 0) onFilesSelected(files);
  }, [onFilesSelected, setIsDragging]);

  return (
    <motion.div
      className={`relative overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-300 p-8 text-center ${
        isDragging ? 'border-emerald-400 bg-emerald-500/10' : 'border-slate-600 hover:border-emerald-500/50 bg-slate-800/30'
      }`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <input type="file" ref={fileInputRef} onChange={(e) => onFilesSelected(Array.from(e.target.files))} multiple accept=".xlsx,.xls" className="hidden" />
      
      <motion.div className="mx-auto w-20 h-20 mb-6 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center">
        <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      </motion.div>

      <h3 className="text-xl font-semibold text-white mb-2">Drag and drop Excel files</h3>
      <p className="text-slate-400 mb-6">or click to browse</p>
      <motion.button
        onClick={() => fileInputRef.current?.click()}
        className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 text-white font-medium shadow-lg"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        Select Files
      </motion.button>
    </motion.div>
  );
};

const FileCard = ({ fileData, onRemove, onOpenSettings }) => (
  <motion.div
    className="bg-slate-800/60 rounded-2xl border border-slate-700/50 overflow-hidden"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    layout
  >
    <div className="p-5 flex justify-between items-center">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">{fileData.fileName}</h3>
          <div className="flex gap-2 text-sm mt-1">
            <span className="text-emerald-400">{fileData.companyName}</span>
            <span className="text-slate-500">•</span>
            <span className="text-cyan-400">{fileData.stationName}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <motion.button
          onClick={onOpenSettings}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          whileHover={{ rotate: 90 }}
          title="Configure Filters"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </motion.button>
        <motion.button
          onClick={onRemove}
          className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </motion.button>
      </div>
    </div>

    <div className="border-t border-slate-700/50 p-5">
      <h4 className="text-sm font-medium text-slate-400 mb-3">Date-wise Valid Count</h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {fileData.counts.map((item, idx) => (
          <motion.div
            key={idx}
            className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.03 }}
          >
            <div className="text-xs text-slate-400 mb-1">{item.date}</div>
            <div className="text-2xl font-bold text-emerald-400">{item.count}</div>
          </motion.div>
        ))}
      </div>
    </div>
  </motion.div>
);

// ============================================
// 3. MAIN PAGE
// ============================================
export default function Home() {
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [wordFilterState, setWordFilterState] = useState({});
  const [uniqueWords, setUniqueWords] = useState([]);

  const processAndAddFiles = useCallback(async (selectedFiles) => {
    const newFiles = [];

    for (const file of selectedFiles) {
      try {
        const jsonData = await parseExcelFile(file);
        const { companyName, stationName } = extractFileInfo(jsonData);
        
        newFiles.push({
          id: `${file.name}-${Date.now()}`,
          fileName: file.name,
          companyName,
          stationName,
          rawData: jsonData,
          counts: [] 
        });
        
      } catch (error) {
        console.error('Error processing file:', error);
      }
    }

    setFiles(prev => [...prev, ...newFiles]);

    // Update Unique Words List
    setUniqueWords(prevWords => {
      const allWords = new Set(prevWords);
      
      newFiles.forEach(file => {
        if (file.rawData) {
            const fileWords = extractUniqueWords(file.rawData);
            fileWords.forEach(w => allWords.add(w));
        }
      });

      const sortedWords = Array.from(allWords).sort();

      // Initialize State: Default Excluded (false) for bad items, Included (true) for others
      setWordFilterState(prevFilter => {
        const newState = { ...prevFilter };
        sortedWords.forEach(word => {
          if (newState[word] === undefined) {
            // Check if it's a "bad" type to set default unchecked
            newState[word] = !isDefaultExcluded(word);
          }
        });
        return newState;
      });

      return sortedWords;
    });

    setIsModalOpen(true);
    
  }, []);

  // Recalculate counts whenever filters change
  useEffect(() => {
    setFiles(prevFiles => prevFiles.map(file => {
      if (!file.rawData) return file;
      const { counts } = processExcelData(file.rawData, wordFilterState);
      return { ...file, counts };
    }));
  }, [wordFilterState]);

  const handleRemoveFile = (id) => setFiles(prev => prev.filter(f => f.id !== id));

  return (
    <div className="min-h-screen bg-slate-950 relative text-white">
      <AnimatedBackground />
      
      <div className="relative z-10 max-w-5xl mx-auto px-4 py-12">
        <motion.header className="text-center mb-12" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">
            Excel Data Processor
          </h1>
          <p className="text-slate-400">Upload, filter, and analyze your Excel data dynamically</p>
        </motion.header>

        <div className="mb-8">
          <UploadZone 
            onFilesSelected={processAndAddFiles}
            isDragging={isDragging}
            setIsDragging={setIsDragging}
          />
        </div>

        {files.length > 0 && (
          <motion.div 
            className="flex justify-end mb-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <button 
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              Edit Filters
            </button>
          </motion.div>
        )}

        <div className="space-y-6">
          <AnimatePresence>
            {files.map(file => (
              <FileCard 
                key={file.id} 
                fileData={file} 
                onRemove={() => handleRemoveFile(file.id)}
                onOpenSettings={() => setIsModalOpen(true)}
              />
            ))}
          </AnimatePresence>
        </div>

        {files.length === 0 && (
          <motion.div 
            className="text-center py-16 text-slate-500"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            No files uploaded. Drag & drop to start.
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <FilterConfigModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            wordFilterState={wordFilterState}
            setWordFilterState={setWordFilterState}
            uniqueWords={uniqueWords}
          />
        )}
      </AnimatePresence>
    </div>
  );
}