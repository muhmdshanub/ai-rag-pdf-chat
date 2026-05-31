import { useContext } from 'react';
import { DocumentContext } from '../context/DocumentContext';

/**
 * Custom hook to read and consume the DocumentContext.
 * 
 * @returns {object} The values and actions provided by DocumentContext.
 */
export default function useDocuments() {
  const context = useContext(DocumentContext);
  if (!context) {
    throw new Error('useDocuments must be used within a DocumentProvider');
  }
  return context;
}
