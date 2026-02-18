'use client'

import { useState, useCallback } from 'react'
import { Upload, FileSpreadsheet, Download, Trash2, CheckCircle, Loader2, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/hooks/use-toast'
import * as XLSX from 'xlsx'

// ============================================
// TYPES
// ============================================

interface ProcessedRow {
  Date: string // Stored as 'YYYY-MM-DD' string to avoid timezone issues
  'Week#': number
  'Capacity reliability score': number
  'Completed routes': number | null
  'Amazon paid cancels': number | null
  'DSP dropped routes': number | null
  'Reliability target': number | null
  'Route target': number | null
  'Flex-up route target': number | null
  'Final scheduled': number | null
  'DSP available capacity': number | null
}

// ============================================
// EXCEL PROCESSING FUNCTIONS
// ============================================

function parseNumber(value: any): number | null {
  if (value === null || value === undefined || value === '-' || value === '') {
    return null
  }
  
  if (typeof value === 'number') {
    return value
  }
  
  if (typeof value === 'string') {
    // Remove percentage sign and parse
    const cleanValue = value.replace('%', '').trim()
    const parsed = parseFloat(cleanValue)
    if (!isNaN(parsed)) {
      // If it was a percentage, convert to decimal
      if (value.includes('%')) {
        return parsed / 100
      }
      return parsed
    }
  }
  
  return null
}

/**
 * Converts a Date object to 'YYYY-MM-DD' string using UTC to preserve 
 * the original date without timezone shifts.
 */
function toIsoDateString(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Calculates the week number for a date string 'YYYY-MM-DD'.
 * Week starts on Sunday (US Standard).
 */
function getWeekNumber(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number)
  
  // Create Date object in UTC to avoid local timezone offset issues
  const current = new Date(Date.UTC(year, month - 1, day))
  
  // Get January 1st of the same year in UTC
  const jan1 = new Date(Date.UTC(year, 0, 1))
  
  // Calculate the day of the year (1 to 366)
  const dayOfYear = ((current.getTime() - jan1.getTime()) / 86400000) + 1
  
  // Get the day of the week for Jan 1st (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const dayOfWeekJan1 = jan1.getUTCDay()
  
  // Calculate week number. 
  // Formula: Week 1 is the week containing Jan 1st.
  // This matches standard US/Excel Week numbering starting on Sunday.
  return Math.ceil((dayOfYear + dayOfWeekJan1) / 7)
}

function processExcelFile(arrayBuffer: ArrayBuffer): ProcessedRow[] {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
  const firstSheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[firstSheetName]
  
  // Get all data as array of arrays
  const data: (string | number | Date | null)[][] = XLSX.utils.sheet_to_json(worksheet, { 
    header: 1,
    defval: null,
    blankrows: false
  })
  
  const processedRows: ProcessedRow[] = []
  
  // Dates are in row 0 (index 0), columns 1 onwards
  const dateRow = data[0]
  const dates: string[] = [] // Store as strings directly
  
  for (let col = 1; col < dateRow.length; col++) {
    const value = dateRow[col]
    // Skip 'Total' column and null/undefined values
    if (value && value !== 'Total' && value !== null && value !== undefined) {
      let dateObj: Date | null = null
      
      if (value instanceof Date) {
        dateObj = value
      } else if (typeof value === 'string') {
        const parsedDate = new Date(value)
        if (!isNaN(parsedDate.getTime())) {
          dateObj = parsedDate
        }
      } else if (typeof value === 'number') {
        // Excel serial date
        const parsed = XLSX.SSF.parse_date_code(value)
        if (parsed) {
          dateObj = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d))
        }
      }

      if (dateObj) {
        dates.push(toIsoDateString(dateObj))
      }
    }
  }
  
  // Process each date and extract corresponding values from rows 1-9
  // Row indices: 1=Capacity reliability, 2=Completed routes, 3=Amazon paid cancels,
  // 4=DSP dropped routes, 5=Reliability target, 6=Route target,
  // 7=Flex-up route target, 8=Final scheduled, 9=DSP available capacity
  
  for (let dateIdx = 0; dateIdx < dates.length; dateIdx++) {
    const dateStr = dates[dateIdx]
    const weekNumber = getWeekNumber(dateStr)
    
    const row: ProcessedRow = {
      Date: dateStr,
      'Week#': weekNumber,
      'Capacity reliability score': 0,
      'Completed routes': null,
      'Amazon paid cancels': null,
      'DSP dropped routes': null,
      'Reliability target': null,
      'Route target': null,
      'Flex-up route target': null,
      'Final scheduled': null,
      'DSP available capacity': null
    }
    
    // Extract values from each metric row (rows 1-9)
    // Column index in data corresponds to dateIdx + 1 (since column 0 is a label)
    const dataColIndex = dateIdx + 1
    
    if (data[1] && dataColIndex < data[1].length) {
      row['Capacity reliability score'] = parseNumber(data[1][dataColIndex]) || 0
    }
    
    if (data[2] && dataColIndex < data[2].length) {
      row['Completed routes'] = parseNumber(data[2][dataColIndex])
    }
    
    if (data[3] && dataColIndex < data[3].length) {
      row['Amazon paid cancels'] = parseNumber(data[3][dataColIndex])
    }
    
    if (data[4] && dataColIndex < data[4].length) {
      row['DSP dropped routes'] = parseNumber(data[4][dataColIndex])
    }
    
    if (data[5] && dataColIndex < data[5].length) {
      row['Reliability target'] = parseNumber(data[5][dataColIndex])
    }
    
    if (data[6] && dataColIndex < data[6].length) {
      row['Route target'] = parseNumber(data[6][dataColIndex])
    }
    
    if (data[7] && dataColIndex < data[7].length) {
      row['Flex-up route target'] = parseNumber(data[7][dataColIndex])
    }
    
    if (data[8] && dataColIndex < data[8].length) {
      row['Final scheduled'] = parseNumber(data[8][dataColIndex])
    }
    
    if (data[9] && dataColIndex < data[9].length) {
      row['DSP available capacity'] = parseNumber(data[9][dataColIndex])
    }
    
    processedRows.push(row)
  }
  
  return processedRows
}

function generateCompiledExcel(allRows: ProcessedRow[]): ArrayBuffer {
  // Sort all rows by date (String comparison works for YYYY-MM-DD)
  allRows.sort((a, b) => a.Date.localeCompare(b.Date))
  
  // Create workbook
  const workbook = XLSX.utils.book_new()
  
  // Convert data to worksheet
  // We pass the Date string directly. Excel will typically recognize 'YYYY-MM-DD' as a date.
  const worksheetData = allRows.map(row => ({
    Date: row.Date,
    'Week#': row['Week#'],
    'Capacity reliability score': row['Capacity reliability score'],
    'Completed routes': row['Completed routes'],
    'Amazon paid cancels': row['Amazon paid cancels'],
    'DSP dropped routes': row['DSP dropped routes'],
    'Reliability target': row['Reliability target'],
    'Route target': row['Route target'],
    'Flex-up route target': row['Flex-up route target'],
    'Final scheduled': row['Final scheduled'],
    'DSP available capacity': row['DSP available capacity']
  }))
  
  const worksheet = XLSX.utils.json_to_sheet(worksheetData)
  
  // Apply custom number formatting to cells
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1')
  for (let R = range.s.r + 1; R <= range.e.r + 1; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C })
      const cell = worksheet[cellAddress]
      if (!cell) continue
      
      // Column C (index 2) is Capacity reliability score - apply percentage format
      if (C === 2 && R > 0) { // Skip header row
        cell.z = '0.0%'
        cell.t = 'n' // Ensure type is number
      }
    }
  }
  
  // Set column widths
  worksheet['!cols'] = [
    { wch: 15 }, // Date
    { wch: 8 },  // Week#
    { wch: 22 }, // Capacity reliability score
    { wch: 18 }, // Completed routes
    { wch: 20 }, // Amazon paid cancels
    { wch: 18 }, // DSP dropped routes
    { wch: 18 }, // Reliability target
    { wch: 14 }, // Route target
    { wch: 20 }, // Flex-up route target
    { wch: 16 }, // Final scheduled
    { wch: 22 }  // DSP available capacity
  ]
  
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Compiled Data')
  
  // Write to buffer
  const excelBuffer = XLSX.write(workbook, { 
    bookType: 'xlsx',
    type: 'array',
    cellDates: true // We still want this enabled, but we are passing ISO strings which are handled safely
  })
  
  return excelBuffer as ArrayBuffer
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function Home() {
  const [files, setFiles] = useState<File[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [compiledFileUrl, setCompiledFileUrl] = useState<string | null>(null)
  const [compiledData, setCompiledData] = useState<ProcessedRow[] | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const { toast } = useToast()

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (file) => file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
    )

    if (droppedFiles.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Please drop Excel files (.xlsx or .xls) only.',
      })
      return
    }

    setFiles((prev) => [...prev, ...droppedFiles])
    setCompiledFileUrl(null)
    setCompiledData(null)
    setShowPreview(false)
    toast({
      title: 'Files added',
      description: `${droppedFiles.length} file(s) added to the queue.`,
    })
  }, [toast])

  const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []).filter(
      (file) => file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
    )

    if (selectedFiles.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Please select Excel files (.xlsx or .xls) only.',
      })
      return
    }

    setFiles((prev) => [...prev, ...selectedFiles])
    setCompiledFileUrl(null)
    setCompiledData(null)
    setShowPreview(false)
    toast({
      title: 'Files added',
      description: `${selectedFiles.length} file(s) added to the queue.`,
    })

    e.target.value = ''
  }, [toast])

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
    setCompiledFileUrl(null)
    setCompiledData(null)
    setShowPreview(false)
  }, [])

  const compileFiles = async () => {
    if (files.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No files to compile',
        description: 'Please add files before compiling.',
      })
      return
    }

    setIsProcessing(true)
    setCompiledFileUrl(null)
    setCompiledData(null)

    try {
      const allRows: ProcessedRow[] = []

      // Process each file
      for (const file of files) {
        try {
          const arrayBuffer = await file.arrayBuffer()
          const rows = processExcelFile(arrayBuffer)
          allRows.push(...rows)
        } catch (error) {
          console.error(`Error processing file ${file.name}:`, error)
          toast({
            variant: 'destructive',
            title: 'Processing Error',
            description: `Could not process file: ${file.name}`,
          })
        }
      }

      if (allRows.length === 0) {
        toast({
          variant: 'destructive',
          title: 'No Data',
          description: 'No valid data could be extracted from the uploaded files.',
        })
        setIsProcessing(false)
        return
      }

      // Sort all rows by date (String comparison)
      allRows.sort((a, b) => a.Date.localeCompare(b.Date))
      
      // Generate compiled Excel file
      const excelBuffer = generateCompiledExcel(allRows)
      
      // Create blob and URL
      const blob = new Blob([excelBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      })
      const url = URL.createObjectURL(blob)
      
      setCompiledData(allRows)
      setCompiledFileUrl(url)
      setShowPreview(true) // Automatically open preview dialog

      toast({
        title: 'Compilation complete',
        description: `Successfully compiled ${allRows.length} rows from ${files.length} file(s).`,
      })
    } catch (error) {
      console.error('Compilation error:', error)
      toast({
        variant: 'destructive',
        title: 'Compilation failed',
        description: 'An error occurred while compiling files.',
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const downloadCompiledFile = useCallback(() => {
    if (!compiledFileUrl) return

    const link = document.createElement('a')
    link.href = compiledFileUrl
    link.download = `Capacity-Reliability-Compiled-${new Date().toISOString().split('T')[0]}.xlsx`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [compiledFileUrl])

  const clearAll = useCallback(() => {
    setFiles([])
    setCompiledFileUrl(null)
    setCompiledData(null)
    setShowPreview(false)
    if (compiledFileUrl) {
      URL.revokeObjectURL(compiledFileUrl)
    }
  }, [compiledFileUrl])

  const formatDate = (dateStr: string): string => {
    // dateStr is expected to be 'YYYY-MM-DD'
    const [year, month, day] = dateStr.split('-')
    return `${month}/${day}/${year}`
  }

  return (
    // Removed default backgrounds to allow global.css body background to show
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            {/* Applied text-glow utility from global.css */}
            <h1 className="text-4xl font-bold text-white text-glow">
              Capacity Compiler
            </h1>
            <p className="text-slate-300">
              Compile multiple capacity reliability files into one document - 100% Client-side Processing
            </p>
          </div>

          {/* Applied glass utility from global.css */}
          <Card className="glass border-[var(--neon-blue)]/20 hover:border-[var(--neon-blue)]/40 transition-all">
            <CardHeader>
              <CardTitle className="text-white">Upload Files</CardTitle>
              <CardDescription className="text-slate-300">
                Drag and drop Excel files or click to select multiple files. All processing happens in your browser - no data leaves your device.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="border-2 border-dashed border-[var(--neon-blue)]/30 rounded-lg p-12 text-center transition-colors hover:border-[var(--neon-blue)] cursor-pointer bg-white/5"
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
              >
                <input
                  type="file"
                  id="fileInput"
                  multiple
                  accept=".xlsx,.xls"
                  onChange={onFileSelect}
                  className="hidden"
                />
                <label htmlFor="fileInput" className="cursor-pointer">
                  {/* Applied neon blue color */}
                  <Upload className="w-16 h-16 mx-auto mb-4 text-[var(--neon-blue)]" />
                  <p className="text-lg font-medium text-white mb-2">
                    Drop files here or click to browse
                  </p>
                  <p className="text-sm text-slate-400">
                    Supports .xlsx and .xls files
                  </p>
                </label>
              </div>

              {files.length > 0 && (
                <div className="mt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-white">
                      Files Queue ({files.length})
                    </h3>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearAll}
                        disabled={isProcessing}
                        className="border-white/20 text-white hover:bg-white/10 hover:text-white"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Clear All
                      </Button>
                      <Button
                        onClick={compileFiles}
                        disabled={isProcessing || files.length === 0}
                        className="bg-[var(--neon-blue)] text-black hover:bg-[var(--neon-blue)]/80"
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <FileSpreadsheet className="w-4 h-4 mr-2" />
                            Compile All Files
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {files.map((file, index) => (
                      <Card key={index} className="bg-white/5 border-white/10">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <FileSpreadsheet className="w-5 h-5 text-[var(--neon-green)] flex-shrink-0" />
                                <p className="font-medium text-white truncate">
                                  {file.name}
                                </p>
                                <p className="text-sm text-slate-400">
                                  ({(file.size / 1024).toFixed(1)} KB)
                                </p>
                              </div>
                            </div>

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeFile(index)}
                              disabled={isProcessing}
                              className="text-slate-400 hover:text-white hover:bg-white/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {compiledFileUrl && !showPreview && (
                    <Card className="border-[var(--neon-green)]/30 bg-[var(--neon-green)]/10">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-[var(--neon-green)]" />
                            <p className="font-medium text-white">
                              Compilation Complete!
                            </p>
                            <p className="text-sm text-slate-300">
                              {files.length} file(s) compiled successfully
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setShowPreview(true)}
                              className="border-white/20 text-white hover:bg-white/10"
                            >
                              <Eye className="w-4 h-4 mr-2" />
                              Preview
                            </Button>
                            <Button
                              onClick={downloadCompiledFile}
                              size="sm"
                              className="bg-[var(--neon-purple)] text-white hover:bg-[var(--neon-purple)]/80"
                            >
                              <Download className="w-4 h-4 mr-2" />
                              Download
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass border-[var(--neon-purple)]/20">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <FileSpreadsheet className="w-6 h-6 text-[var(--neon-purple)] flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-white">
                    All Processing Happens in Your Browser
                  </p>
                  <p className="text-sm text-slate-300">
                    Your data never leaves your device. All Excel files are processed client-side for maximum privacy and security.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Preview Dialog - Dark Mode with White Text */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="!w-[98vw] !max-w-[98vw] max-h-[90vh] overflow-hidden p-0 bg-[#0f0f2d]/95 backdrop-blur-xl border border-[var(--neon-blue)]/30 text-white">
          <DialogHeader className="p-4 border-b border-white/10">
            <DialogTitle className="text-[var(--neon-blue)] text-glow">Compiled Data Preview</DialogTitle>
            <DialogDescription className="text-slate-300">
              Review the compiled data before downloading. Showing {compiledData?.length || 0} rows from {files.length} file(s).
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[70vh] overflow-auto">
            <div className="min-w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-white/20 hover:bg-transparent">
                    <TableHead className="whitespace-nowrap min-w-[100px] text-white font-semibold">Date</TableHead>
                    <TableHead className="whitespace-nowrap min-w-[60px] text-white font-semibold">Week#</TableHead>
                    <TableHead className="whitespace-nowrap min-w-[150px] text-white font-semibold">Capacity reliability score</TableHead>
                    <TableHead className="whitespace-nowrap min-w-[120px] text-white font-semibold">Completed routes</TableHead>
                    <TableHead className="whitespace-nowrap min-w-[140px] text-white font-semibold">Amazon paid cancels</TableHead>
                    <TableHead className="whitespace-nowrap min-w-[130px] text-white font-semibold">DSP dropped routes</TableHead>
                    <TableHead className="whitespace-nowrap min-w-[130px] text-white font-semibold">Reliability target</TableHead>
                    <TableHead className="whitespace-nowrap min-w-[110px] text-white font-semibold">Route target</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {compiledData?.map((row, index) => (
                    <TableRow key={index} className="border-b border-white/10 hover:bg-white/5">
                      {/* Changed text colors to white/slate-200 for visibility */}
                      <TableCell className="whitespace-nowrap font-medium text-white">{formatDate(row.Date)}</TableCell>
                      <TableCell className="whitespace-nowrap text-slate-200">{row['Week#']}</TableCell>
                      <TableCell className="whitespace-nowrap text-slate-200">
                        {typeof row['Capacity reliability score'] === 'number' 
                          ? `${(row['Capacity reliability score'] * 100).toFixed(1)}%` 
                          : '-'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-slate-200">{row['Completed routes'] ?? '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-slate-200">{row['Amazon paid cancels'] ?? '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-slate-200">{row['DSP dropped routes'] ?? '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-slate-200">{row['Reliability target'] ?? '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-slate-200">{row['Route target'] ?? '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>

          <DialogFooter className="flex gap-2 p-4 border-t border-white/10">
            <Button
              variant="outline"
              onClick={() => setShowPreview(false)}
              className="border-white/20 text-white hover:bg-white/10 hover:text-white"
            >
              Close
            </Button>
            <Button
              onClick={downloadCompiledFile}
              disabled={!compiledFileUrl}
              className="bg-[var(--neon-blue)] text-black hover:bg-[var(--neon-blue)]/80"
            >
              <Download className="w-4 h-4 mr-2" />
              Download Compiled File
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog> 
    </div>
  )
}