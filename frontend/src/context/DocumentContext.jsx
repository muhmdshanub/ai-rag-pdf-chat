/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useEffect, useRef, useCallback } from 'react';
import { 
  listDocuments, 
  uploadDocument as apiUploadDocument, 
  getUploadProgress, 
  deleteDocument as apiDeleteDocument 
} from '../services/api';
import { 
  POLL_INTERVAL_MS, 
  MAX_FILE_SIZE_MB, 
  ACCEPTED_FILE_TYPES 
} from '../utils/constants';

export const DocumentContext = createContext(null);

/**
 * Context provider managing uploaded documents list, selected active document,
 * file upload progression queue, and background polling for processing states.
 */
export function DocumentProvider({ children }) {
  const [documents, setDocuments] = useState([]);
  const [activeDocumentId, setActiveDocumentId] = useState(null);
  const [uploadQueue, setUploadQueue] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Keep track of active intervals for cleanups
  const pollingIntervals = useRef({});

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await listDocuments();
      if (res.success && res.data) {
        setDocuments(res.data.documents || []);
      } else {
        setError(res.error || 'Failed to fetch documents');
      }
    } catch (err) {
      setError(err.error || err.message || 'Failed to fetch documents');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Poll for document progress
  const startPolling = useCallback((docId) => {
    if (pollingIntervals.current[docId]) {
      return; // Already polling
    }

    const intervalId = setInterval(async () => {
      try {
        const res = await getUploadProgress(docId);
        if (res.success && res.data && res.data.document) {
          const doc = res.data.document;
          
          setDocuments((prevDocs) => 
            prevDocs.map((d) => 
              d.id === doc.id 
                ? { ...d, status: doc.status, progress: doc.progress, totalChunks: doc.totalChunks } 
                : d
            )
          );

          if (doc.status === 'completed' || doc.status === 'failed') {
            clearInterval(intervalId);
            delete pollingIntervals.current[docId];
            // Fetch list once to update final chunk values
            fetchDocuments();
          }
        }
      } catch (err) {
        if (err.statusCode === 404) {
          clearInterval(intervalId);
          delete pollingIntervals.current[docId];
        }
      }
    }, POLL_INTERVAL_MS);

    pollingIntervals.current[docId] = intervalId;
  }, [fetchDocuments]);

  // Upload document
  const uploadDocument = useCallback(async (file) => {
    const tempId = `temp-${Date.now()}`;
    const fileName = file.name;

    // Validate type
    if (!ACCEPTED_FILE_TYPES.includes(file.type) && !file.name.endsWith('.txt')) {
      const errorMsg = 'Only PDF and plain text files are supported.';
      setUploadQueue((prev) => ({
        ...prev,
        [tempId]: { fileName, progress: 0, status: 'failed', error: errorMsg }
      }));
      throw new Error(errorMsg);
    }

    // Validate size
    const maxSizeInBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
    if (file.size > maxSizeInBytes) {
      const errorMsg = `File must be under ${MAX_FILE_SIZE_MB}MB.`;
      setUploadQueue((prev) => ({
        ...prev,
        [tempId]: { fileName, progress: 0, status: 'failed', error: errorMsg }
      }));
      throw new Error(errorMsg);
    }

    // Add to upload queue
    setUploadQueue((prev) => ({
      ...prev,
      [tempId]: { fileName, progress: 0, status: 'processing', error: null }
    }));

    try {
      const res = await apiUploadDocument(file);
      if (res.success && res.data && res.data.document) {
        const doc = res.data.document;
        
        // Remove from upload queue
        setUploadQueue((prev) => {
          const next = { ...prev };
          delete next[tempId];
          return next;
        });

        // Pre-insert into documents list
        setDocuments((prevDocs) => {
          if (prevDocs.some((d) => d.id === doc.id)) {
            return prevDocs.map((d) => d.id === doc.id ? doc : d);
          }
          return [doc, ...prevDocs];
        });

        // Trigger polling
        startPolling(doc.id);
        
        return doc;
      } else {
        throw new Error(res.error || 'Upload failed');
      }
    } catch (err) {
      const errorMsg = err.error || err.message || 'Upload failed. Please try again.';
      setUploadQueue((prev) => ({
        ...prev,
        [tempId]: { fileName, progress: 0, status: 'failed', error: errorMsg }
      }));
      throw err;
    }
  }, [startPolling]);

  // Delete document
  const deleteDocument = useCallback(async (docId) => {
    try {
      const res = await apiDeleteDocument(docId);
      if (res.success) {
        setDocuments((prevDocs) => prevDocs.filter((d) => d.id !== docId));
        if (activeDocumentId === docId) {
          setActiveDocumentId(null);
        }
        if (pollingIntervals.current[docId]) {
          clearInterval(pollingIntervals.current[docId]);
          delete pollingIntervals.current[docId];
        }
      }
    } catch (err) {
      console.error(`Failed to delete document ${docId}:`, err);
      throw err;
    }
  }, [activeDocumentId]);

  // Cleanup polling intervals on unmount
  useEffect(() => {
    const intervals = pollingIntervals.current;
    return () => {
      Object.values(intervals).forEach(clearInterval);
    };
  }, []);

  // Fetch initial documents list, deferred to avoid render cascading lint errors
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDocuments();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchDocuments]);

  const value = {
    documents,
    activeDocumentId,
    setActiveDocumentId,
    uploadQueue,
    isLoading,
    error,
    fetchDocuments,
    uploadDocument,
    deleteDocument,
    startPolling
  };

  return (
    <DocumentContext.Provider value={value}>
      {children}
    </DocumentContext.Provider>
  );
}
