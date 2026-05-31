import { useState } from 'react';
import useDocuments from '../../hooks/useDocuments';
import DropZone from '../documents/DropZone';
import DocumentList from '../documents/DocumentList';
import ConfirmModal from '../ui/ConfirmModal';

/**
 * Sidebar component showing branding and acting as the global Document Manager.
 */
const Sidebar = () => {
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
      console.error('Sidebar upload action failed:', err);
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
    setDocumentToDelete(id);
  };

  const confirmDeletion = () => {
    if (documentToDelete) {
      deleteDocument(documentToDelete);
    }
  };

  return (
    <>
      <nav className="bg-surface-container/40 dark:bg-surface-container/40 backdrop-blur-xl glass-shimmer h-screen w-sidebar-width fixed left-0 top-0 border-r border-white/10 shadow-sm flex flex-col p-gutter gap-4 z-50">
        
        {/* Header Branding */}
        <div className="flex items-center gap-3 mb-2 select-none shrink-0">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-container to-surface-container-highest flex items-center justify-center border border-white/10 overflow-hidden shrink-0">
            <img
              alt="User Profile"
              className="w-full h-full object-cover"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuAq0XyyMbgXI54JgSlDlkRoc1UOJEjCW56CaoJDtT2Q8UawEofTIqSyaJmHUuHgO-IxAFpjw6UiQ_fHjybc_UyvcyZ5HNCE0A4h3rXHtzwuKP_-wHpQ18ULOHTpbsAWZae-lqVbvM0-kJ_6cIQhRHGfPkiuKE0qba98uSLJFdr7st_D4a_yq22PDv09zR5kIkH1ggGRBZFuVy6wNb6O224qIzOhLuS68eRPYVdjFpS_HLtVcpy7zp-5ji3kiIUMDelCY3O-sfV8frQ"
            />
          </div>
          <div>
            <h1 className="font-headline-md text-headline-md font-bold text-primary dark:text-primary tracking-tight">
              RAG Insights
            </h1>
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest opacity-80 mt-0.5">
              Knowledge Base
            </p>
          </div>
        </div>

        <hr className="border-white/5 my-2 shrink-0" />
        
        <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-1 scrollbar-hide">
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
        </div>
      </nav>

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
};

export default Sidebar;
