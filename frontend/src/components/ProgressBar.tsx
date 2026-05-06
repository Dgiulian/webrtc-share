import { formatSpeed, formatETA } from '../utils/zip';

interface ProgressBarProps {
  progress: number; // 0-100
  label?: string;
  subLabel?: string;
  speed?: number; // bytes per second
  eta?: number; // seconds
  showDetails?: boolean;
  variant?: 'default' | 'zipping' | 'transfer';
}

export function ProgressBar({
  progress,
  label,
  subLabel,
  speed,
  eta,
  showDetails = false,
  variant = 'default'
}: ProgressBarProps) {
  const getVariantColor = () => {
    switch (variant) {
      case 'zipping':
        return 'from-purple-500 to-pink-500';
      case 'transfer':
        return 'from-cyan-500 to-blue-500';
      default:
        return 'from-cyan-400 to-blue-500';
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {label && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-white font-medium">{label}</span>
          <span className="text-white/80 font-mono">{Math.round(progress)}%</span>
        </div>
      )}
      
      {subLabel && (
        <p className="text-white/60 text-sm mb-3">{subLabel}</p>
      )}

      <div className="relative h-3 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm">
        <div
          className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${getVariantColor()} transition-all duration-300 ease-out`}
          style={{ width: `${Math.min(progress, 100)}%` }}
        >
          {/* Shimmer effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
        </div>
      </div>

      {showDetails && (speed !== undefined || eta !== undefined) && (
        <div className="flex justify-between items-center mt-2 text-sm text-white/60">
          {speed !== undefined && speed > 0 && (
            <span>{formatSpeed(speed)}</span>
          )}
          {eta !== undefined && eta > 0 && (
            <span>~{formatETA(eta)} remaining</span>
          )}
        </div>
      )}
    </div>
  );
}