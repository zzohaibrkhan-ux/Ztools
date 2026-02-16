import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';

// THIS IS CRITICAL: The function must be named 'POST'
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    
    if (files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }

    const allFiles: { name: string; data: Buffer }[] = [];

    // 1. Process uploaded files (extract ZIPs if present)
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (file.name.toLowerCase().endsWith('.zip')) {
        // Extract ZIP files using JSZip
        const zip = await JSZip.loadAsync(buffer);
        
        // Create an array of promises for file extraction
        const extractionPromises = Object.keys(zip.files).map(async (filename) => {
          // Skip folders and hidden files (like __MACOSX)
          if (filename.endsWith('/') || filename.includes('__MACOSX')) return null;
          
          // Only process valid spreadsheet files
          if (filename.endsWith('.xlsx') || filename.endsWith('.xls') || filename.endsWith('.csv')) {
            const content = await zip.files[filename].async('nodebuffer');
            return { name: filename, data: content };
          }
          return null;
        });
        
        const extractedFiles = (await Promise.all(extractionPromises)).filter(Boolean) as { name: string; data: Buffer }[];
        allFiles.push(...extractedFiles);
      } else {
        // Add regular files directly
        allFiles.push({ name: file.name, data: buffer });
      }
    }

    if (allFiles.length === 0) {
      return NextResponse.json({ error: 'No valid Excel or CSV files found' }, { status: 400 });
    }

    // 2. Process Excel/CSV files
    const workbook = XLSX.utils.book_new();
    
    allFiles.forEach((file, index) => {
      try {
        const fileWorkbook = XLSX.read(file.data, { type: 'buffer' });
        const firstSheetName = fileWorkbook.SheetNames[0];
        
        if (firstSheetName) {
          const worksheet = fileWorkbook.Sheets[firstSheetName];
          // Create a safe sheet name (max 31 chars, no special chars)
          const safeName = `Report_${index + 1}`.substring(0, 31);
          XLSX.utils.book_append_sheet(workbook, worksheet, safeName);
        }
      } catch (parseError) {
        console.warn(`Skipping file ${file.name}: could not parse`);
      }
    });

    // 3. Generate Output Buffer
    if (workbook.SheetNames.length === 0) {
      return NextResponse.json({ error: 'Could not process any valid data sheets' }, { status: 500 });
    }

    const outputBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // 4. Return the compiled file
    return new NextResponse(outputBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="compiled-report.xlsx"'
      }
    });

  } catch (error) {
    console.error('Processing Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}