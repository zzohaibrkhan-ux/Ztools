"use client";

import React, { useState, useCallback, useMemo } from "react";
import JSZip from "jszip";
import { motion, AnimatePresence } from "framer-motion";

// Types
interface TrainingRecord {
  assignmentDate: string;
  paymentDate: string;
  station: string;
  dspShortCode: string;
  deliveryAssociate: string;
  serviceType: string;
  courseName: string;
  chapterName: string;
  totalDuration: string;
  dspPaymentEligible: string;
  sourceFile: string;
}

interface DurationGroup {
  duration: string;
  count: number;
  paymentDates: string[];
}

interface NameSummary {
  name: string;
  totalCount: number;
  durationGroups: DurationGroup[];
}

// Configurable Filter Aliases
const EXCLUDED_PAYMENT_VALUES = ["No", "NO", "no", "N", "n", "false", "False", "FALSE"];
const EXCLUDED_DURATION_VALUES = ["0 hr", "0hr", "0", "0 h", "0 hours", ""];

const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
};

export default function TrainingReportProcessor() {
  const [allRecords, setAllRecords] = useState<TrainingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [expandedName, setExpandedName] = useState<string | null>(null);
  const [sourceFiles, setSourceFiles] = useState<string[]>([]);

  // Process CSV content into records
  const parseCSVContent = useCallback((content: string, fileName: string): TrainingRecord[] => {
    const lines = content.split("\n").filter((line) => line.trim());
    if (lines.length < 2) return [];

    // Find header indices dynamically to be safe
    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
    
    const getIdx = (names: string[]) => {
      for (const name of names) {
        const idx = headers.findIndex(h => h.includes(name.toLowerCase()));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const idx = {
      assignmentDate: getIdx(['assignment date']),
      paymentDate: getIdx(['payment date']),
      station: getIdx(['station']),
      dspShortCode: getIdx(['dsp short code']),
      deliveryAssociate: getIdx(['delivery associate']),
      serviceType: getIdx(['service type']),
      courseName: getIdx(['course name']),
      chapterName: getIdx(['chapter name']),
      totalDuration: getIdx(['total duration']),
      dspPaymentEligible: getIdx(['dsp payment eligible', 'payment eligible']),
    };

    const records: TrainingRecord[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < 5) continue; // Skip empty/broken lines

      const record: TrainingRecord = {
        assignmentDate: values[idx.assignmentDate] || "",
        paymentDate: values[idx.paymentDate] || "",
        station: values[idx.station] || "",
        dspShortCode: values[idx.dspShortCode] || "",
        deliveryAssociate: values[idx.deliveryAssociate] || "",
        serviceType: values[idx.serviceType] || "",
        courseName: values[idx.courseName] || "",
        chapterName: values[idx.chapterName] || "",
        totalDuration: values[idx.totalDuration] || "",
        dspPaymentEligible: values[idx.dspPaymentEligible] || "",
        sourceFile: fileName,
      };
      records.push(record);
    }

    return records;
  }, []);

  // Handle file processing
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    setIsLoading(true);
    const tempRecords: TrainingRecord[] = [];
    const validFiles: string[] = [];

    for (const file of Array.from(files)) {
      // Check if it's a zip file
      if (file.name.endsWith(".zip")) {
        try {
          const zip = await JSZip.loadAsync(file);
          for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
            // Logic 1: File name must contain "training" (case-insensitive)
            if (
              !zipEntry.dir &&
              zipEntry.name.toLowerCase().includes("training") &&
              zipEntry.name.endsWith(".csv")
            ) {
              const content = await zipEntry.async("string");
              const parsed = parseCSVContent(content, zipEntry.name);
              tempRecords.push(...parsed);
              validFiles.push(zipEntry.name);
            }
          }
        } catch (error) {
          console.error("Error processing zip:", error);
        }
      }
      // Check if it's a raw CSV file with "training" in name
      else if (file.name.toLowerCase().includes("training") && file.name.endsWith(".csv")) {
        try {
          const content = await file.text();
          const parsed = parseCSVContent(content, file.name);
          tempRecords.push(...parsed);
          validFiles.push(file.name);
        } catch (error) {
          console.error("Error processing CSV:", error);
        }
      }
    }

    setAllRecords(tempRecords);
    setSourceFiles(validFiles);
    setIsLoading(false);
  }, [parseCSVContent]);

  // Filter and Aggregate Data
  const summaryData = useMemo(() => {
    // Logic 2: Filter rows
    const filtered = allRecords.filter((record) => {
      // Remove rows with "No" in DSP Payment Eligible
      const isPaymentEligible = !EXCLUDED_PAYMENT_VALUES.includes(
        record.dspPaymentEligible.toLowerCase().trim()
      );

      // Remove rows with "0 hr" in Total Duration
      const isValidDuration = !EXCLUDED_DURATION_VALUES.includes(
        record.totalDuration.toLowerCase().trim()
      );

      return isPaymentEligible && isValidDuration;
    });

    // Aggregate by Name -> Duration
    const nameMap = new Map<string, Map<string, DurationGroup>>();

    filtered.forEach((record) => {
      const name = record.deliveryAssociate;
      const duration = record.totalDuration;
      const payDate = record.paymentDate;

      if (!nameMap.has(name)) {
        nameMap.set(name, new Map());
      }

      const durationMap = nameMap.get(name)!;

      if (!durationMap.has(duration)) {
        durationMap.set(duration, {
          duration: duration,
          count: 0,
          paymentDates: [],
        });
      }

      const entry = durationMap.get(duration)!;
      entry.count++;
      if (payDate && !entry.paymentDates.includes(payDate)) {
        entry.paymentDates.push(payDate);
      }
    });

    // Convert to array for rendering
    const result: NameSummary[] = [];
    nameMap.forEach((durMap, name) => {
      const groups = Array.from(durMap.values());
      // Sort groups by duration descending (optional, simple string sort or custom logic)
      groups.sort((a, b) => b.duration.localeCompare(a.duration));

      const totalCount = groups.reduce((sum, g) => sum + g.count, 0);

      result.push({
        name,
        totalCount,
        durationGroups: groups,
      });
    });

    // Sort by total count descending
    return result.sort((a, b) => b.totalCount - a.totalCount);
  }, [allRecords]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  };

  const downloadReport = () => {
    // Generate CSV for download based on filtered summary data or raw filtered data
    const filtered = allRecords.filter((record) => {
      const isPaymentEligible = !EXCLUDED_PAYMENT_VALUES.includes(record.dspPaymentEligible.toLowerCase().trim());
      const isValidDuration = !EXCLUDED_DURATION_VALUES.includes(record.totalDuration.toLowerCase().trim());
      return isPaymentEligible && isValidDuration;
    });

    const headers = [
      "Delivery Associate", "Total Duration", "Count", "Payment Dates"
    ];

    const rows: string[] = [];
    
    summaryData.forEach(summary => {
      summary.durationGroups.forEach(group => {
        rows.push([
          `"${summary.name}"`,
          group.duration,
          group.count.toString(),
          `"${group.paymentDates.join(", ")}"`
        ].join(","));
      });
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `training_summary_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen p-4 md:p-8">
      {/* Background Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-[var(--neon-purple)] opacity-20 rounded-full blur-[100px]" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-[var(--neon-blue)] opacity-20 rounded-full blur-[100px]" />
      </div>

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-4xl md:text-5xl font-bold text-glow mb-2">WST Training Report</h1>
          <p className="text-white/60 text-lg">Upload files with "Training" in the filename</p>
        </motion.div>

        {/* Upload Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-2xl p-6 mb-6"
        >
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 ${
              dragActive
                ? "border-[var(--neon-blue)] bg-[var(--neon-blue)]/10"
                : "border-white/20 hover:border-[var(--neon-purple)]/50"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="mb-4">
              <svg
                className="w-16 h-16 mx-auto text-[var(--neon-blue)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
            <p className="text-white/80 text-lg mb-2">Drag & Drop ZIP or CSV files</p>
            <p className="text-white/50 text-sm mb-4">
              Only files with "Training" in the name will be processed
            </p>
            <input
              type="file"
              multiple
              accept=".csv,.zip"
              onChange={handleFileInput}
              className="hidden"
              id="fileInput"
            />
            <label
              htmlFor="fileInput"
              className="inline-block px-6 py-3 bg-gradient-to-r from-[var(--neon-blue)] to-[var(--neon-purple)] rounded-lg cursor-pointer font-semibold text-white hover:opacity-90 transition-opacity"
            >
              Browse Files
            </label>
          </div>

          {isLoading && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <div className="w-5 h-5 border-2 border-[var(--neon-blue)] border-t-transparent rounded-full animate-spin" />
              <span className="text-[var(--neon-blue)]">Processing files...</span>
            </div>
          )}

          {sourceFiles.length > 0 && (
            <div className="mt-4 p-4 bg-white/5 rounded-lg">
              <p className="text-white/60 text-sm mb-2">Processed Files:</p>
              <div className="flex flex-wrap gap-2">
                {sourceFiles.map((file, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 bg-[var(--neon-purple)]/20 border border-[var(--neon-purple)]/30 rounded-full text-sm text-white/80"
                  >
                    {file}
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {/* Download Button */}
        {summaryData.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-end mb-4"
          >
            <button
              onClick={downloadReport}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[var(--neon-green)] to-[var(--neon-blue)] rounded-lg font-semibold text-black hover:opacity-90 transition-opacity text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Download Summary
            </button>
          </motion.div>
        )}

        {/* Pivot Table / List */}
        {summaryData.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass rounded-2xl overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    <th className="px-6 py-4 text-left text-white/60 font-semibold">
                      Delivery Associate
                    </th>
                    <th className="px-6 py-4 text-center text-white/60 font-semibold">
                      Total Count
                    </th>
                    <th className="px-6 py-4 text-left text-white/60 font-semibold">
                      Duration Breakdown
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summaryData.map((summary, idx) => (
                    <React.Fragment key={summary.name}>
                      <motion.tr
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.03 * idx }}
                        className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                        onClick={() =>
                          setExpandedName(expandedName === summary.name ? null : summary.name)
                        }
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-2 h-2 rounded-full transition-colors ${
                                expandedName === summary.name
                                  ? "bg-[var(--neon-blue)]"
                                  : "bg-[var(--neon-purple)]"
                              }`}
                            />
                            <span className="text-white font-medium">{summary.name}</span>
                            <svg
                              className={`w-4 h-4 text-white/40 transition-transform ${
                                expandedName === summary.name ? "rotate-180" : ""
                              }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 9l-7 7-7-7"
                              />
                            </svg>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="inline-block px-4 py-1 bg-[var(--neon-blue)]/20 border border-[var(--neon-blue)]/30 rounded-full text-[var(--neon-blue)] font-bold">
                            {summary.totalCount}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-2">
                            {summary.durationGroups.map((group) => (
                              <span
                                key={group.duration}
                                className="px-3 py-1 bg-[var(--neon-purple)]/20 border border-[var(--neon-purple)]/30 rounded-full text-sm text-white/80"
                              >
                                {group.duration}: <span className="font-bold">{group.count}</span>
                              </span>
                            ))}
                          </div>
                        </td>
                      </motion.tr>

                      {/* Expanded Details */}
                      <AnimatePresence>
                        {expandedName === summary.name && (
                          <motion.tr
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="bg-white/5"
                          >
                            <td colSpan={3} className="px-6 py-4">
                              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {summary.durationGroups.map((group) => (
                                  <div
                                    key={group.duration}
                                    className="p-4 bg-black/20 rounded-xl border border-white/10"
                                  >
                                    <div className="flex justify-between items-center mb-3">
                                      <h4 className="text-[var(--neon-purple)] font-bold text-lg">
                                        {group.duration}
                                      </h4>
                                      <span className="text-white/40 text-sm">
                                        Count: {group.count}
                                      </span>
                                    </div>
                                    <div>
                                      <p className="text-white/60 text-xs mb-2 uppercase tracking-wider">
                                        Payment Dates
                                      </p>
                                      <div className="flex flex-wrap gap-1">
                                        {group.paymentDates.map((date) => (
                                          <span
                                            key={date}
                                            className="px-2 py-1 bg-[var(--neon-blue)]/10 border border-[var(--neon-blue)]/20 rounded text-xs text-[var(--neon-blue)]"
                                          >
                                            {date}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </motion.tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* Empty State */}
        {allRecords.length === 0 && !isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass rounded-2xl p-12 text-center mt-6"
          >
            <svg
              className="w-24 h-24 mx-auto text-white/20 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-white/40 text-lg">
              Drop CSV or ZIP files containing "Training" in the name
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}