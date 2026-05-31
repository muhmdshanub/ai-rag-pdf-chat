import DocumentListItem from './DocumentListItem';
import EmptyState from '../ui/EmptyState';

/**
 * Lists document contexts. Handles empty states.
 * 
 * @param {object} props
 * @param {Array} props.documents - Array of document items.
 * @param {number|null} props.activeDocumentId - Currently selected document ID.
 * @param {Function} props.onSelect - Item selection callback.
 * @param {Function} props.onDelete - Item deletion callback.
 * @param {Function} [props.onRetry] - Item retry callback.
 */
export default function DocumentList({
  documents = [],
  activeDocumentId,
  onSelect,
  onDelete,
  onRetry
}) {
  if (!documents || documents.length === 0) {
    return (
      <EmptyState
        icon="folder_open"
        title="No documents yet"
        description="Upload a PDF to begin"
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {documents.map((doc) => (
        <DocumentListItem
          key={doc.id}
          id={doc.id}
          fileName={doc.original_name || doc.originalName || doc.filename || doc.fileName}
          fileSize={doc.size || doc.fileSize}
          chunkCount={doc.totalChunks || doc.chunkCount}
          status={doc.status}
          progress={doc.progress}
          statusText={doc.statusText}
          errorMessage={doc.error || doc.errorMessage}
          isActive={activeDocumentId === doc.id}
          onSelect={onSelect}
          onDelete={onDelete}
          onRetry={onRetry}
        />
      ))}
    </div>
  );
}
