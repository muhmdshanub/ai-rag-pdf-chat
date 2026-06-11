import { useState } from 'react';
import useDocuments from '../../hooks/useDocuments';
import DropZone from './DropZone';
import DocumentListItem from './DocumentListItem';
import ConfirmModal from '../ui/ConfirmModal';

export default function DocumentManagerLanding() {
  const { 
    documents, 
    uploadQueue, 
    uploadDocument, 
    deleteDocument, 
    setActiveDocumentId,
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
  const isUploading = Object.values(uploadQueue).some(item => item.status === 'processing');

  const handleFileAccepted = async (file) => {
    try {
      await uploadDocument(file);
    } catch (err) {
      console.error('Landing upload action failed:', err);
    }
  };

  const handleSelect = (id) => {
    if (typeof id === 'string' && id.startsWith('temp-')) return;
    setActiveDocumentId(id);
  };

  const handleDeleteClick = (id) => {
    if (typeof id === 'string' && id.startsWith('temp-')) return;
    setDocumentToDelete(id);
  };

  const confirmDeletion = () => {
    if (documentToDelete) {
      deleteDocument(documentToDelete);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background p-container-padding-desktop">
      <div className="max-w-5xl mx-auto py-10 animate-enter">
        <header className="mb-12 text-center">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-primary-container to-surface-container-highest flex items-center justify-center border border-white/10 shadow-lg mb-6">
            <span className="material-symbols-outlined text-[40px] text-primary">auto_awesome</span>
          </div>
          <h1 className="text-4xl font-headline-md font-bold text-on-surface mb-4 tracking-tight">
            Welcome to RAG Insights
          </h1>
          <p className="text-lg text-on-surface-variant max-w-2xl mx-auto leading-relaxed">
            Upload your PDF documents to instantly turn them into interactive knowledge bases. Our enterprise-grade engine uses Hybrid Search, MMR, and Cross-Encoder Re-ranking to deliver precise answers.
          </p>
        </header>

        <section className="mb-12">
          <div className="max-w-2xl mx-auto">
            <DropZone 
              onFileAccepted={handleFileAccepted}
              isUploading={isUploading}
            />
          </div>
        </section>

        {allDocuments.length > 0 && (
          <section className="animate-enter delay-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-headline-md font-semibold text-on-surface">Your Knowledge Base</h2>
              <span className="text-label-sm font-label-sm bg-surface-container-high text-on-surface-variant px-3 py-1 rounded-full border border-white/5">
                {allDocuments.length} Document{allDocuments.length !== 1 ? 's' : ''}
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {allDocuments.map((doc) => (
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
                  isActive={false}
                  onSelect={handleSelect}
                  onDelete={handleDeleteClick}
                  onRetry={startPolling}
                />
              ))}
            </div>
          </section>
        )}
      </div>

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
    </div>
  );
}
