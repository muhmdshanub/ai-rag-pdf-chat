import Badge from '../ui/Badge';
import ProgressBar from '../ui/ProgressBar';
import { formatFileSize } from '../../utils/formatters';

/**
 * Single document card displaying the active/processing/error status of a document.
 * 
 * @param {object} props
 * @param {number} props.id - The database ID of the document.
 * @param {string} props.fileName - The document filename.
 * @param {number|string} [props.fileSize] - The document size in bytes or formatted string.
 * @param {number} [props.chunkCount] - Number of parsed text chunks.
 * @param {'completed'|'processing'|'failed'} props.status - The current state.
 * @param {number} [props.progress=0] - Processing progress percent.
 * @param {string} [props.statusText] - Current substatus during processing.
 * @param {string} [props.errorMessage] - Detailed error message on failure.
 * @param {boolean} [props.isActive=false] - Whether the document is selected.
 * @param {Function} props.onSelect - Triggered when the card is clicked.
 * @param {Function} props.onDelete - Triggered when delete icon is clicked.
 * @param {Function} [props.onRetry] - Triggered when retry is clicked on error.
 */
export default function DocumentListItem({
  id,
  fileName,
  fileSize,
  chunkCount,
  status,
  progress = 0,
  statusText,
  errorMessage,
  isActive = false,
  onSelect,
  onDelete,
  onRetry
}) {
  const displaySize = typeof fileSize === 'number' ? formatFileSize(fileSize) : fileSize;
  
  const handleItemClick = (e) => {
    if (e.target.closest('.delete-btn') || e.target.closest('.retry-btn')) {
      return;
    }
    onSelect(id);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete(id);
  };

  const handleRetry = (e) => {
    e.stopPropagation();
    if (onRetry) onRetry(id);
  };

  let accentBarColor = 'bg-primary opacity-80';
  let containerBorder = 'border-white/5';
  
  if (status === 'processing') {
    accentBarColor = 'bg-tertiary opacity-80';
    containerBorder = 'border-tertiary-container/30';
  } else if (status === 'failed') {
    accentBarColor = 'bg-error opacity-60';
    containerBorder = 'border-error/20';
  }

  const activeClass = isActive ? 'ring-1 ring-primary/30 bg-surface-container-high' : 'bg-surface-container';

  return (
    <div
      onClick={handleItemClick}
      className={`hover-glow ${activeClass} border ${containerBorder} rounded-lg p-3 group relative overflow-hidden cursor-pointer transition-all`}
    >
      <div className={`absolute top-0 left-0 w-1 h-full ${accentBarColor}`} />
      
      <div className="flex justify-between items-start mb-1 pl-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <span className={`material-symbols-outlined text-[16px] ${
            status === 'processing' ? 'text-tertiary' : status === 'failed' ? 'text-error' : 'text-primary'
          }`}>
            description
          </span>
          <span className="font-label-md text-label-md text-on-surface truncate pr-2 select-none" title={fileName}>
            {fileName}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleDelete}
            className="delete-btn opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-white/10 rounded text-error hover:text-error-container"
            title="Delete Document"
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
          </button>
          
          {status === 'completed' && (
            <span
              className="material-symbols-outlined text-[16px] text-primary"
              style={{ fontVariationSettings: '"FILL" 1' }}
            >
              check_circle
            </span>
          )}
          
          {status === 'processing' && (
            <span className="font-label-sm text-label-sm text-tertiary animate-pulse-soft">
              {progress}%
            </span>
          )}

          {status === 'failed' && (
            <span className="material-symbols-outlined text-[16px] text-error">
              error
            </span>
          )}
        </div>
      </div>

      {status === 'processing' && (
        <div className="mt-2 mb-1.5 ml-2 w-[calc(100%-8px)]">
          <ProgressBar progress={progress} color="tertiary" />
        </div>
      )}

      <div className="flex justify-between items-center text-on-surface-variant pl-2">
        {status === 'completed' && (
          <>
            <span className="font-label-sm text-label-sm opacity-70">
              {displaySize}{chunkCount !== undefined ? ` • ${chunkCount} Chunks` : ''}
            </span>
            <Badge status="completed" />
          </>
        )}
        
        {status === 'processing' && (
          <span className="font-label-sm text-label-sm opacity-70 animate-pulse-soft">
            {statusText || 'Embedding vectors...'}
          </span>
        )}

        {status === 'failed' && (
          <>
            <span className="font-label-sm text-label-sm text-error opacity-90 truncate max-w-[200px]" title={errorMessage}>
              {errorMessage || 'Parsing failure'}
            </span>
            {onRetry && (
              <button
                onClick={handleRetry}
                className="retry-btn hover:underline font-label-sm text-label-sm text-error hover:text-error-container"
              >
                Retry
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
