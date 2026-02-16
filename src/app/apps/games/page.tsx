'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileText, Download, CheckCircle, AlertCircle, Loader2, Archive, X, RotateCcw } from 'lucide-react';

interface ProcessingStep {
  id: string;
  title: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  description?: string;
}

const INITIAL_STEPS: ProcessingStep[] = [
  { id: '1', title: 'Upload Files', status: 'pending' },
  { id: '2', title: 'Process Service Details Report', status: 'pending' },
  { id: '3', title: 'Process Training Weekly Report', status: 'pending' },
  { id: '4', title: 'Compile Reports', status: 'pending' },
  { id: '5', title: 'Generate Final Report', status: 'pending' }
];

export default function WSTVariableCompiler() {
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [processedFile, setProcessedFile] = useState<string | null>(null);
  const [steps, setSteps] = useState<ProcessingStep[]>(INITIAL_STEPS);
  const [error, setError] = useState<string | null>(null);
  
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (processedFile) {
        window.URL.revokeObjectURL(processedFile);
      }
    };
  }, [processedFile]);

  const filterValidFiles = (fileList: FileList | File[]) => {
    const validExtensions = ['.xlsx', '.xls', '.csv', '.zip'];
    return Array.from(fileList).filter(file =>
      validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))
    );
  };

  const handleFiles = (newFiles: File[]) => {
    if (newFiles.length === 0) return;
    setError(null);
    setFiles(prev => {
      const existingFileNames = new Set(prev.map(f => f.name));
      const uniqueNewFiles = newFiles.filter(f => !existingFileNames.has(f.name));
      return [...prev, ...uniqueNewFiles];
    });
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragActive(true);
    }
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const validFiles = filterValidFiles(e.dataTransfer.files);
      handleFiles(validFiles);
      e.dataTransfer.clearData();
    }
  }, []);

  const handleClick = () => {
    if (inputRef.current) {
      inputRef.current.click();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const validFiles = filterValidFiles(e.target.files);
      handleFiles(validFiles);
      e.target.value = ''; 
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const updateStepStatus = (stepId: string, status: ProcessingStep['status'], description?: string) => {
    setSteps(prev => prev.map(step =>
      step.id === stepId ? { ...step, status, description } : step
    ));
  };

  const resetState = () => {
    setFiles([]);
    setProcessing(false);
    setError(null);
    setSteps(INITIAL_STEPS);
    if (processedFile) {
      window.URL.revokeObjectURL(processedFile);
    }
    setProcessedFile(null);
  };

  // UPDATED: Robust processing function
  const processFiles = async () => {
    if (files.length === 0) {
      setError('Please upload at least one file');
      return;
    }

    setProcessing(true);
    setError(null);
    if (processedFile) {
      window.URL.revokeObjectURL(processedFile);
      setProcessedFile(null);
    }
    setSteps(INITIAL_STEPS);

    try {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });

      updateStepStatus('1', 'completed');
      updateStepStatus('2', 'processing', 'Processing Service Details Report...');

      const response = await fetch('/api/process-files', {
        method: 'POST',
        body: formData
      });

      // ROBUST ERROR HANDLING START
      if (!response.ok) {
        let errorMessage = `Server Error: ${response.status}`;
        try {
          // Try to read the body as text first
          const text = await response.text();
          if (text) {
            try {
              // Try to parse that text as JSON
              const errorData = JSON.parse(text);
              errorMessage = errorData.error || errorMessage;
            } catch {
              // If it's not JSON, use the raw text (e.g., HTML error page or plain text)
              errorMessage = text;
            }
          }
        } catch (readError) {
          console.error('Failed to read error response', readError);
        }
        throw new Error(errorMessage);
      }
      // ROBUST ERROR HANDLING END

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      setProcessedFile(url);

      updateStepStatus('2', 'completed');
      updateStepStatus('3', 'completed', 'Training Weekly Report processed (if available)');
      updateStepStatus('4', 'completed', 'Reports compiled successfully');
      updateStepStatus('5', 'completed', 'Final report generated');

    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An error occurred during processing');
      updateStepStatus('2', 'error', 'Processing failed');
    } finally {
      setProcessing(false);
    }
  };

  const downloadFile = () => {
    if (processedFile) {
      const a = document.createElement('a');
      a.href = processedFile;
      a.download = 'compiled-report.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const getStepIcon = (status: ProcessingStep['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'processing':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <div className="w-5 h-5 border-2 border-gray-300 rounded-full" />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50 mb-2">
            WST Variable Compiler
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Upload your Excel/CSV files or ZIP folders to process and compile Service Details and Training reports
          </p>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-50">
                <Upload className="w-5 h-5" />
                Upload Files
              </CardTitle>
              <CardDescription className="text-slate-600 dark:text-slate-400">
                Drag and drop your Excel/CSV files or ZIP folders here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                onClick={handleClick}
                onDragEnter={handleDragIn}
                onDragLeave={handleDragOut}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                    : 'border-slate-300 dark:border-slate-700 hover:border-slate-400'
                }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept=".xlsx,.xls,.csv,.zip"
                  onChange={handleInputChange}
                  className="hidden"
                />
                
                <Upload className="w-12 h-12 mx-auto mb-4 text-slate-400" />
                {isDragActive ? (
                  <p className="text-blue-600 dark:text-blue-400">Drop files here...</p>
                ) : (
                  <div>
                    <p className="text-slate-600 dark:text-slate-400 mb-2">
                      Drag & drop files here, or click to select
                    </p>
                    <p className="text-sm text-slate-500">
                      Supports .xlsx, .xls, .csv, and .zip
                    </p>
                  </div>
                )}
              </div>

              {files.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-medium mb-2 text-slate-900 dark:text-slate-50">Uploaded Files:</h4>
                  <div className="space-y-2">
                    {files.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {file.name.toLowerCase().endsWith('.zip') ? (
                            <Archive className="w-4 h-4 text-orange-500 flex-shrink-0" />
                          ) : (
                            <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                          )}
                          <span className="text-sm text-slate-900 dark:text-slate-50 truncate">{file.name}</span>
                          <span className="text-xs text-slate-500 flex-shrink-0">
                            ({(file.size / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => removeFile(index)} disabled={processing}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-slate-900 dark:text-slate-50">Processing Steps</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {steps.map((step) => (
                  <div key={step.id} className="flex items-center gap-3">
                    {getStepIcon(step.status)}
                    <div className="flex-1">
                      <div className="font-medium text-slate-900 dark:text-slate-50">{step.title}</div>
                      {step.description && (
                        <div className="text-sm text-slate-600 dark:text-slate-400">{step.description}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-4 justify-center flex-wrap">
            <Button onClick={processFiles} disabled={files.length === 0 || processing} size="lg">
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Process Files
                </>
              )}
            </Button>

            {processedFile && (
              <>
                <Button onClick={downloadFile} variant="outline" size="lg">
                  <Download className="w-4 h-4 mr-2" />
                  Download Result
                </Button>
                <Button onClick={resetState} variant="ghost" size="lg">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Start Over
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}