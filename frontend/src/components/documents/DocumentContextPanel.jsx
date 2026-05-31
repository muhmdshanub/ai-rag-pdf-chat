import { useState } from 'react';
import DropZone from './DropZone';
import DocumentList from './DocumentList';
import ConfirmModal from '../ui/ConfirmModal';
import useDocuments from '../../hooks/useDocuments';

/**
 * Left 320px column panel wrapping DropZone and DocumentList, connected to DocumentContext.
 */
export default function DocumentContextPanel() {
  const { 
    documents, 
    activeDocumentId, 
    setActiveDocumentId,
    uploadQueue, 
    uploadDocument, 
    deleteDocument, 
    startPolling 
  } = useDocuments();

  const [documentToDelete, setDocumentToDelete] = useState(null);

  // Combine database documents with temporary queue upload items
  const queueItems = Object.entries(uploadQueue).map(([tempId, item]) => ({
    id: tempId,
    filename: item.fileName,
    status: item.status,
    progress: item.progress,
    error: item.error
  }));

  const allDocuments = [...queueItems, ...documents];

  const handleFileAccepted = async (file) => {
    try {
      await uploadDocument(file);
    } catch (err) {
      console.error('Context Panel upload action failed:', err);
    }
  };

  const handleSelect = (id) => {
    if (typeof id === 'string' && id.startsWith('temp-')) {
      return;
    }
    setActiveDocumentId(id);
  };

  const handleDeleteClick = (id) => {
    if (typeof id === 'string' && id.startsWith('temp-')) {
      return;
    }
    // Set the document ID instead of deleting immediately
    setDocumentToDelete(id);
  };

  const confirmDeletion = () => {
    if (documentToDelete) {
      deleteDocument(documentToDelete);
    }
  };

  return (
    <>
      <aside className="w-[320px] shrink-0 border-r border-white/5 bg-surface-dim/30 flex flex-col p-4 gap-4 overflow-y-auto z-10 relative">
        <h2 className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-2 select-none">
          Active Context
        </h2>
        
        <DropZone 
          onFileAccepted={handleFileAccepted}
          isUploading={Object.values(uploadQueue).some(item => item.status === 'processing')}
        />

        <DocumentList
          documents={allDocuments}
          activeDocumentId={activeDocumentId}
          onSelect={handleSelect}
          onDelete={handleDeleteClick}
          onRetry={startPolling}
        />
      </aside>

      <ConfirmModal
        isOpen={documentToDelete !== null}
        title="Delete Document"
        message="Are you sure you want to delete this document? This action cannot be undone and will erase all associated chat history."
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={confirmDeletion}
        onCancel={() => setDocumentToDelete(null)}
      />
    </>
  );
}
