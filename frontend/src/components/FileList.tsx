import { formatFileSize } from '../utils/zip';
import type { FileWithPath } from '../utils/zip';

interface FileListProps {
  files: FileWithPath[];
  totalSize: number;
  onRemove?: (index: number) => void;
  disabled?: boolean;
}

export function FileList({ files, totalSize, onRemove, disabled }: FileListProps) {
  if (files.length === 0) return null;

  return (
    <div className="w-full max-w-2xl mx-auto mt-6 p-4 bg-glass-100 backdrop-blur-md rounded-xl border border-white/10">
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-white font-medium">
          {files.length} {files.length === 1 ? 'file' : 'files'} selected
        </h4>
        <span className="text-white/60 text-sm">{formatFileSize(totalSize)}</span>
      </div>

      <div className="max-h-48 overflow-y-auto space-y-2">
        {files.map((fileWithPath, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-2 bg-white/5 rounded-lg"
          >
            <div className="flex-1 min-w-0 mr-3">
              <p className="text-white text-sm truncate" title={fileWithPath.path}>
                {fileWithPath.path}
              </p>
              <p className="text-white/50 text-xs">
                {formatFileSize(fileWithPath.file.size)}
              </p>
            </div>
            
            {onRemove && !disabled && (
              <button
                onClick={() => onRemove(index)}
                className="p-1 text-white/40 hover:text-red-400 transition-colors"
                title="Remove file"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}