import { useCallback, useState, useRef } from 'react';
import { getFilesFromDrop, getFilesFromInput } from '../utils/zip';
import type { FileWithPath } from '../utils/zip';

interface DropZoneProps {
  onFilesSelected: (files: FileWithPath[]) => void;
  disabled?: boolean;
}

export function DropZone({ onFilesSelected, disabled }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files = await getFilesFromDrop(e);
    if (files.length > 0) {
      onFilesSelected(files);
    }
  }, [disabled, onFilesSelected]);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = await getFilesFromInput(e.target);
    if (files.length > 0) {
      onFilesSelected(files);
    }
    // Reset input
    e.target.value = '';
  }, [onFilesSelected]);

  const handleClick = useCallback(() => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  }, [disabled]);

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative w-full max-w-2xl mx-auto p-12 rounded-2xl cursor-pointer transition-all duration-300
        border-2 border-dashed
        ${isDragging 
          ? 'border-cyan-400 bg-glass-300 backdrop-blur-xl' 
          : 'border-white/20 bg-glass-100 backdrop-blur-md hover:border-white/40 hover:bg-glass-200'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      {/* File input - works for both desktop and mobile */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInput}
        disabled={disabled}
      />

      <div className="text-center">
        <div className="mb-4">
          <svg
            className={`w-16 h-16 mx-auto transition-transform duration-300 ${isDragging ? 'scale-110 text-cyan-400' : 'text-white/60'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>

        <h3 className="text-xl font-medium text-white mb-2">
          {isDragging ? 'Drop files here' : 'Drop files or click to browse'}
        </h3>
        
        <p className="text-white/60 text-sm">
          Supports multiple files and folders
        </p>
        
        <p className="text-white/40 text-xs mt-2">
          Maximum total size: 100 MB
        </p>
      </div>

      {/* Glow effect when dragging */}
      {isDragging && (
        <div className="absolute inset-0 rounded-2xl bg-cyan-400/10 blur-xl -z-10" />
      )}
    </div>
  );
}
