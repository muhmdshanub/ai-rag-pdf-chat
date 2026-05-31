import { useRef, useState } from 'react';

/**
 * DropZone component for file uploads via drag-and-drop or clicking to browse.
 * 
 * @param {object} props
 * @param {Function} props.onFileAccepted - Callback when a file is selected.
 * @param {boolean} [props.isUploading] - Whether an upload is in progress.
 * @param {string|null} [props.error] - Inline error message to display.
 */
export default function DropZone({ onFileAccepted, isUploading, error }) {
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragActive(false);
    
    if (isUploading) return;

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileAccepted(e.dataTransfer.files[0]);
    }
  };

  const handleClick = () => {
    if (isUploading) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      onFileAccepted(e.target.files[0]);
    }
  };

  const containerClasses = [
    'border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center transition-all backdrop-blur-sm group mb-2 select-none',
    isDragActive 
      ? 'border-primary bg-surface-container/80 shadow-[0_0_15px_rgba(208,188,255,0.05)]' 
      : 'border-outline-variant/50 hover:bg-surface-container/50 hover:border-primary/50 bg-surface-container-lowest/50',
    isUploading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
  ].join(' ');

  return (
    <div
      className={containerClasses}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".pdf,.txt"
        disabled={isUploading}
      />
      <div className={`w-12 h-12 rounded-full bg-surface-container flex items-center justify-center mb-3 transition-transform ${isDragActive ? 'scale-110 bg-primary/10' : 'group-hover:scale-110 group-hover:bg-primary/10'}`}>
        <span className={`material-symbols-outlined text-[24px] transition-colors ${isDragActive ? 'text-primary' : 'text-outline group-hover:text-primary'}`}>
          cloud_upload
        </span>
      </div>
      <p className="font-body-md text-body-md text-on-surface font-medium">
        {isUploading ? 'Uploading file...' : 'Drop PDF here'}
      </p>
      <p className="font-label-sm text-label-sm text-on-surface-variant mt-1">
        {isUploading ? 'Please wait' : 'or click to browse'}
      </p>
      {error && (
        <p className="text-error text-label-sm font-label-sm mt-2 animate-pulse-soft">
          {error}
        </p>
      )}
    </div>
  );
}
