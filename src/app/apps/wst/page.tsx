'use client'

import { useState, DragEvent, ChangeEvent } from 'react'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { Upload, FileText, Download, AlertCircle, Loader2, Archive, Copy, Check, FolderUp, FileUp } from 'lucide-react'

// --- Types ---
interface ProcessedRow {
  [key: string]: any
}

interface ServiceDetailsRow extends ProcessedRow {
  'Service Type': string
  'Planned Duration': string
  'Distance unit': string
  'Date'?: string
  'Delivery Associate'?: string
  'Excluded?'?: string
}

interface TrainingRow extends ProcessedRow {
  'DSP Payment Eligible': string
  'Total Duration': string
  'Service Type': string
  'Payment Date': string
  'Delivery Associate': string
}

// --- Helper Functions ---

function findWorksheetByName(workbook: XLSX.WorkBook, namePattern: string): XLSX.WorkSheet | null {
  for (const sheetName of workbook.SheetNames) {
    if (sheetName.toLowerCase() === namePattern.toLowerCase()) return workbook.Sheets[sheetName]
  }
  for (const sheetName of workbook.SheetNames) {
    if (sheetName.toLowerCase().includes(namePattern.toLowerCase())) return workbook.Sheets[sheetName]
  }
  return null
}

function findAllFilesByName(files: File[], namePattern: string): File[] {
  return files.filter(file => file.name.toLowerCase().includes(namePattern.toLowerCase()))
}

async function extractZipFile(zipFile: File): Promise<File[]> {
  try {
    const zip = new JSZip()
    const zipData = await zipFile.arrayBuffer()
    const loadedZip = await zip.loadAsync(zipData)
    const extractedFiles: File[] = []

    for (const [filename, file] of Object.entries(loadedZip.files)) {
      if (file.dir) continue
      const ext = filename.toLowerCase().split('.').pop()
      if (!['xlsx', 'xls', 'csv'].includes(ext || '')) continue

      const fileData = await file.async('uint8array')
      const mime = ext === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      const blob = new Blob([fileData], { type: mime })
      extractedFiles.push(new File([blob], filename, { type: mime }))
    }
    return extractedFiles
  } catch (error) {
    console.error(`Failed to extract ZIP: ${error}`)
    return []
  }
}

function formatDate(dateValue: any): string {
  if (!dateValue) return ''
  try {
    if (dateValue instanceof Date) {
      return `${(dateValue.getMonth() + 1).toString().padStart(2, '0')}/${dateValue.getDate().toString().padStart(2, '0')}/${dateValue.getFullYear()}`
    }
    if (typeof dateValue === 'string') {
      const date = new Date(dateValue)
      if (!isNaN(date.getTime())) return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear()}`
    }
    if (typeof dateValue === 'number') {
      const date = new Date((dateValue - 25569) * 86400 * 1000)
      if (!isNaN(date.getTime())) return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear()}`
    }
    return dateValue.toString()
  } catch {
    return dateValue.toString()
  }
}

function removeColumnsAfterExcluded(data: ServiceDetailsRow[]): ServiceDetailsRow[] {
  if (data.length === 0) return data
  const firstRow = data[0]
  const columnOrder: string[] = []
  let excludedIndex = -1

  for (const key in firstRow) {
    columnOrder.push(key)
    if (key.toLowerCase().includes('excluded')) excludedIndex = columnOrder.length - 1
  }

  if (excludedIndex !== -1) {
    const allowedColumns = columnOrder.slice(0, excludedIndex + 1)
    return data.map(row => {
      const filteredRow: ServiceDetailsRow = {}
      allowedColumns.forEach(col => { if (row[col] !== undefined) filteredRow[col] = row[col] })
      return filteredRow
    })
  }
  return data
}

function normalizeColumnName(columnName: string): string {
  return columnName.trim().toLowerCase()
}

function findColumnIndex(row: any, possibleNames: string[]): string | null {
  if (!row || typeof row !== 'object') return null
  for (const key in row) {
    const normalizedKey = normalizeColumnName(key.toString())
    for (const possibleName of possibleNames) {
      if (normalizedKey === normalizeColumnName(possibleName)) return key
    }
  }
  return null
}

function processServiceDetailsReport(worksheet: XLSX.WorkSheet): ServiceDetailsRow[] {
  const jsonData = XLSX.utils.sheet_to_json(worksheet) as ServiceDetailsRow[]
  if (jsonData.length === 0) return []

  const firstRow = jsonData[0]
  const serviceTypeCol = findColumnIndex(firstRow, ['Service Type', 'ServiceType'])
  const plannedDurationCol = findColumnIndex(firstRow, ['Planned Duration', 'PlannedDuration'])
  const distanceUnitCol = findColumnIndex(firstRow, ['Distance unit', 'DistanceUnit'])

  if (!serviceTypeCol || !distanceUnitCol) return []

  const mergedData = jsonData.map(row => {
    const serviceType = row[serviceTypeCol] || ''
    const plannedDuration = plannedDurationCol ? (row[plannedDurationCol] || '') : ''
    if (serviceType && plannedDuration && !serviceType.toString().includes(plannedDuration.toString())) {
      row[serviceTypeCol] = `${serviceType} - ${plannedDuration}`
    }
    return row
  })

  return mergedData.filter(row => {
    const distanceUnit = row[distanceUnitCol]
    return distanceUnit && distanceUnit.toString().toLowerCase().includes('miles')
  })
}

function processTrainingWeeklyReport(worksheet: XLSX.WorkSheet): TrainingRow[] {
  const jsonData = XLSX.utils.sheet_to_json(worksheet) as TrainingRow[]
  if (jsonData.length === 0) return []

  const firstRow = jsonData[0]
  const paymentEligibleCol = findColumnIndex(firstRow, ['DSP Payment Eligible'])
  const totalDurationCol = findColumnIndex(firstRow, ['Total Duration', 'TotalDuration'])
  const serviceTypeCol = findColumnIndex(firstRow, ['Service Type', 'ServiceType'])

  if (!paymentEligibleCol || !totalDurationCol) return []

  const paymentEligible = jsonData.filter(row => {
    const eligible = row[paymentEligibleCol]
    return eligible && eligible.toString().toLowerCase() !== 'no'
  })

  const nonZeroDuration = paymentEligible.filter(row => {
    const duration = row[totalDurationCol]
    return duration && duration.toString() !== '0 hr' && duration.toString() !== '0hr' && duration.toString() !== '0'
  })

  return nonZeroDuration.map(row => {
    const serviceType = serviceTypeCol ? (row[serviceTypeCol] || '') : ''
    const totalDuration = row[totalDurationCol] || ''
    if (serviceTypeCol && serviceType && totalDuration && !serviceType.toString().includes(totalDuration.toString())) {
      row[serviceTypeCol!] = `${serviceType} - ${totalDuration}`
    }
    return row
  })
}

function compileReports(serviceData: ServiceDetailsRow[], trainingData: TrainingRow[]): ServiceDetailsRow[] {
  const compiledData = [...serviceData]
  trainingData.forEach(trainingRow => {
    const compiledRow: ServiceDetailsRow = {
      ...trainingRow,
      'Distance unit': 'miles',
      'Excluded?': 'no',
      'Date': trainingRow['Payment Date'] || trainingRow['PaymentDate'] || '',
      'Planned Duration': trainingRow['Total Duration'] || trainingRow['TotalDuration'] || ''
    }
    compiledData.push(compiledRow)
  })

  compiledData.forEach(row => {
    if (row['Date']) row['Date'] = formatDate(row['Date'])
  })

  return removeColumnsAfterExcluded(compiledData)
}

// --- Component ---

export default function WSTPage() {
  const [processing, setProcessing] = useState(false)
  const [processedFile, setProcessedFile] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<ServiceDetailsRow[]>([])
  const [isCopied, setIsCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)

  // Core Processing Logic
  const runProcessing = async (inputFiles: File[]) => {
    if (inputFiles.length === 0) return

    setProcessing(true)
    setError(null)
    setProcessedFile(null)
    setPreviewData([])

    try {
      // 1. Flatten: Extract Zips, keep others
      const allFiles: File[] = []
      for (const file of inputFiles) {
        if (file.name.toLowerCase().endsWith('.zip')) {
          const extracted = await extractZipFile(file)
          allFiles.push(...extracted)
        } else {
          allFiles.push(file)
        }
      }

      // 2. Identify: Find all matching files
      const serviceFiles = findAllFilesByName(allFiles, 'Service Details Report')
      const trainingFiles = findAllFilesByName(allFiles, 'Training Weekly Report')

      if (serviceFiles.length === 0 && trainingFiles.length === 0) {
        throw new Error('No valid reports found. Filenames must include "Service Details Report" or "Training Weekly Report".')
      }

      // 3. Process: Map all files to data arrays
      let compiledServiceData: ServiceDetailsRow[] = []
      for (const file of serviceFiles) {
        try {
          const buffer = await file.arrayBuffer()
          const wb = XLSX.read(buffer)
          const ws = findWorksheetByName(wb, 'Service Details Report') || wb.Sheets[wb.SheetNames[0]]
          const data = processServiceDetailsReport(ws)
          compiledServiceData.push(...data)
        } catch (e) {
          console.warn(`Error processing ${file.name}`, e)
        }
      }

      let compiledTrainingData: TrainingRow[] = []
      for (const file of trainingFiles) {
        try {
          const buffer = await file.arrayBuffer()
          const wb = XLSX.read(buffer)
          const ws = findWorksheetByName(wb, 'Training Weekly Report') || wb.Sheets[wb.SheetNames[0]]
          const data = processTrainingWeeklyReport(ws)
          compiledTrainingData.push(...data)
        } catch (e) {
          console.warn(`Error processing ${file.name}`, e)
        }
      }

      // 4. Compile
      const finalData = compileReports(compiledServiceData, compiledTrainingData)
      
      if (finalData.length === 0) throw new Error('No valid data rows found.')

      // 5. Generate Download File
      const newWorkbook = XLSX.utils.book_new()
      const newWorksheet = XLSX.utils.json_to_sheet(finalData)
      XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, 'Compiled Report')
      
      const excelBuffer = XLSX.write(newWorkbook, { type: 'array', bookType: 'xlsx' })
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = window.URL.createObjectURL(blob)
      
      setProcessedFile(url)
      setPreviewData(finalData)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setProcessing(false)
    }
  }

  // --- Event Handlers ---

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      runProcessing(Array.from(e.dataTransfer.files))
    }
  }

  // Handle specific file input (Files/Zip)
  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      runProcessing(Array.from(e.target.files))
      e.target.value = '' 
    }
  }

  // Handle folder input
  const handleFolderInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      runProcessing(Array.from(e.target.files))
      e.target.value = '' 
    }
  }

  const downloadFile = () => {
    if (processedFile) {
      const a = document.createElement('a')
      a.href = processedFile
      a.download = 'compiled-report.xlsx'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  }

  const copyToClipboard = () => {
    if (previewData.length === 0) return
    try {
      const headers = Object.keys(previewData[0])
      const tsv = [
        headers.join('\t'),
        ...previewData.map(row => 
          headers.map(h => {
            const cell = row[h] ?? ''
            return typeof cell === 'string' ? cell.replace(/\t/g, ' ').replace(/\n/g, ' ') : cell
          }).join('\t')
        )
      ].join('\n')

      const textArea = document.createElement("textarea")
      textArea.value = tsv
      textArea.style.position = "fixed"
      textArea.style.left = "-999999px"
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      
      const successful = document.execCommand('copy')
      document.body.removeChild(textArea)
      
      if (successful) {
        setIsCopied(true)
        setTimeout(() => setIsCopied(false), 2000)
      }
    } catch (err) {
      console.error('Copy error:', err)
    }
  }

  return (
    <div className="min-h-screen w-full bg-transparent p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2 text-glow text-white">
            Work Summary Tool Processor
          </h1>
          <p className="text-gray-400">
            Upload Files, Folders, or ZIPs to compile reports instantly
          </p>
        </div>

        <div className="grid gap-6">
          
          {/* Upload Section */}
          <div className="glass rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-[#00f3ff] shrink-0" />
                <h2 className="text-xl font-semibold text-white">Data Source</h2>
              </div>
              {processing && (
                 <div className="flex items-center gap-2 text-[#00f3ff]">
                   <Loader2 className="w-5 h-5 animate-spin" />
                   <span className="text-sm">Processing...</span>
                 </div>
              )}
            </div>

            {/* Drag and Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-all relative ${
                isDragActive
                  ? 'border-[#00f3ff] bg-[#00f3ff]/10'
                  : 'border-white/20 hover:border-[#bc13fe]'
              }`}
            >
              <div className="pointer-events-none flex flex-col items-center justify-center mb-6">
                <Archive className="w-10 h-10 mb-2 text-gray-500" />
                {isDragActive ? (
                  <p className="text-[#00f3ff] font-medium">Drop to start processing...</p>
                ) : (
                  <div className="text-gray-500">
                    <p className="font-medium">Drag & Drop Files or Folders here</p>
                    <p className="text-xs mt-1">Supports XLSX, CSV, ZIP</p>
                  </div>
                )}
              </div>

              {/* Explicit Action Options */}
              <div className="flex flex-wrap justify-center gap-4 relative z-10">
                
                {/* Option 1: Files */}
                <label className="cursor-pointer">
                  <input 
                    type="file" 
                    multiple 
                    onChange={handleFileInput}
                    className="hidden"
                    accept=".xlsx,.xls,.csv,.zip"
                  />
                  <div className="w-fit px-6 py-3 rounded-lg font-medium bg-white/5 text-gray-300 hover:bg-white/10 transition-all flex items-center justify-center gap-2 border border-white/10 hover:border-[#00f3ff]">
                    <FileUp className="w-4 h-4" />
                    Select Files
                  </div>
                </label>

                {/* Option 2: Folder */}
                <label className="cursor-pointer">
                  <input 
                    type="file" 
                    multiple
                    // @ts-ignore
                    webkitdirectory="true"
                    onChange={handleFolderInput}
                    className="hidden"
                  />
                  <div className="w-fit px-6 py-3 rounded-lg font-medium bg-white/5 text-gray-300 hover:bg-white/10 transition-all flex items-center justify-center gap-2 border border-white/10 hover:border-[#bc13fe]">
                    <FolderUp className="w-4 h-4" />
                    Select Folder
                  </div>
                </label>

              </div>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg flex items-center gap-2 shrink-0">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Result Actions */}
          {processedFile && (
            <div className="flex flex-wrap gap-4 justify-center">
              <button
                onClick={downloadFile}
                className="w-fit px-8 py-3 rounded-lg font-semibold bg-[#00f3ff] text-black hover:bg-[#00f3ff]/80 transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#00f3ff]/20 shrink-0"
              >
                <Download className="w-4 h-4" />
                Download Result
              </button>
            </div>
          )}

          {/* Preview Section */}
          {previewData.length > 0 && (
            <div className="glass rounded-lg p-6 mt-4 overflow-hidden">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                 <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-[#0aff10] shrink-0" />
                    <h2 className="text-xl font-semibold text-white">Compiled Preview</h2>
                    <span className="text-xs text-gray-500">({previewData.length} total rows)</span>
                 </div>
                 
                 <button
                    onClick={copyToClipboard}
                    className={`w-fit px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 shrink-0 ${
                      isCopied 
                        ? 'bg-[#0aff10]/20 text-[#0aff10] border border-[#0aff10]/50' 
                        : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10'
                    }`}
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-4 h-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy All Data
                      </>
                    )}
                  </button>
              </div>

              <div className="overflow-x-auto max-h-[500px] overflow-y-auto rounded-md border border-white/10">
                <table className="w-full text-sm text-left text-gray-300">
                  <thead className="text-xs uppercase bg-[#0a0a1a]/50 text-gray-400 sticky top-0 backdrop-blur-sm z-10">
                    <tr>
                      {Object.keys(previewData[0]).map((key, i) => (
                        <th key={i} scope="col" className="px-4 py-3 whitespace-nowrap border-b border-white/10">
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((row, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        {Object.keys(row).map((key, j) => (
                          <td key={j} className="px-4 py-2 whitespace-nowrap">
                            {row[key]?.toString() ?? '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}