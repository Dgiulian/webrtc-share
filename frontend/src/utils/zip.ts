/**
 * ZIP file utilities using JSZip
 */

import JSZip from 'jszip';

export interface FileWithPath {
  file: File;
  path: string;
}

/**
 * Create a ZIP file from multiple files with preserved folder structure
 */
export async function createZip(
  files: FileWithPath[],
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const zip = new JSZip();
  const totalFiles = files.length;

  files.forEach((fileWithPath, index) => {
    zip.file(fileWithPath.path, fileWithPath.file, {
      compression: 'STORE', // No compression as specified
    });
    
    onProgress?.((index + 1) / totalFiles);
  });

  return await zip.generateAsync({
    type: 'blob',
    compression: 'STORE',
    compressionOptions: { level: 0 }
  });
}

/**
 * Extract files from a ZIP blob
 */
export async function extractZip(zipBlob: Blob): Promise<File[]> {
  const zip = await JSZip.loadAsync(zipBlob);
  const files: File[] = [];

  for (const [path, zipEntry] of Object.entries(zip.files)) {
    if (!zipEntry.dir) {
      const blob = await zipEntry.async('blob');
      const file = new File([blob], path, { type: 'application/octet-stream' });
      files.push(file);
    }
  }

  return files;
}

/**
 * Get files from a drop event, preserving folder structure
 */
export async function getFilesFromDrop(event: React.DragEvent): Promise<FileWithPath[]> {
  const files: FileWithPath[] = [];
  
  if (event.dataTransfer.items) {
    const items = Array.from(event.dataTransfer.items);
    
    for (const item of items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          const entryFiles = await traverseEntry(entry);
          files.push(...entryFiles);
        }
      }
    }
  } else {
    // Fallback for older browsers
    const droppedFiles = Array.from(event.dataTransfer.files);
    files.push(...droppedFiles.map(file => ({ file, path: file.name })));
  }

  return files;
}

/**
 * Get files from file input, preserving folder structure when supported
 */
export async function getFilesFromInput(input: HTMLInputElement): Promise<FileWithPath[]> {
  const files: FileWithPath[] = [];
  
  if (input.files) {
    const fileList = Array.from(input.files);
    
    // Check if webkitRelativePath is available (folder selection)
    if (fileList.length > 0 && fileList[0].webkitRelativePath) {
      return fileList.map(file => ({
        file,
        path: file.webkitRelativePath
      }));
    }
    
    // Regular file selection
    return fileList.map(file => ({
      file,
      path: file.name
    }));
  }

  return files;
}

/**
 * Recursively traverse a file system entry
 */
async function traverseEntry(entry: FileSystemEntry, path: string = ''): Promise<FileWithPath[]> {
  const files: FileWithPath[] = [];
  const fullPath = path ? `${path}/${entry.name}` : entry.name;

  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await getFileFromEntry(fileEntry);
    files.push({ file, path: fullPath });
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const entries = await readDirectory(dirEntry);
    
    for (const childEntry of entries) {
      const childFiles = await traverseEntry(childEntry, fullPath);
      files.push(...childFiles);
    }
  }

  return files;
}

/**
 * Get a File from a FileSystemFileEntry
 */
function getFileFromEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

/**
 * Read all entries from a directory
 */
function readDirectory(dirEntry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const reader = dirEntry.createReader();
    const entries: FileSystemEntry[] = [];

    function readEntries() {
      reader.readEntries(
        (results) => {
          if (results.length === 0) {
            resolve(entries);
          } else {
            entries.push(...Array.from(results));
            readEntries();
          }
        },
        reject
      );
    }

    readEntries();
  });
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format transfer speed
 */
export function formatSpeed(bytesPerSecond: number): string {
  return formatFileSize(bytesPerSecond) + '/s';
}

/**
 * Format ETA
 */
export function formatETA(seconds: number): string {
  if (seconds < 60) {
    return Math.round(seconds) + 's';
  } else if (seconds < 3600) {
    return Math.round(seconds / 60) + 'm';
  } else {
    return Math.round(seconds / 3600) + 'h';
  }
}