import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const axiosInstance = axios.create({
  baseURL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
});

// Response interceptor: unwrap response.data so callers always get { success, data, message }
axiosInstance.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    if (error.response && error.response.data) {
      return Promise.reject(error.response.data);
    }
    return Promise.reject({
      success: false,
      error: error.message || 'Network Error',
      code: 'NETWORK_ERROR'
    });
  }
);

/**
 * Uploads a file (PDF or TXT) to the backend.
 * Method: POST /api/upload
 * 
 * @param {File} file - The file to upload.
 * @returns {Promise} Resolves to upload status.
 */
export function uploadDocument(file) {
  const formData = new FormData();
  formData.append('file', file);
  return axiosInstance.post('/api/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
}

/**
 * Retrieves the processing progress and status of an uploaded document.
 * Method: GET /api/upload/:documentId/progress
 * 
 * @param {number} documentId - The database ID of the document.
 * @returns {Promise} Resolves to progress status.
 */
export function getUploadProgress(documentId) {
  return axiosInstance.get(`/api/upload/${documentId}/progress`);
}

/**
 * Lists all processed/processing documents.
 * Method: GET /api/documents
 * 
 * @returns {Promise} Resolves to document list.
 */
export function listDocuments() {
  return axiosInstance.get('/api/documents');
}

/**
 * Retrieves details for a specific document.
 * Method: GET /api/documents/:id
 * 
 * @param {number} id - Document ID.
 * @returns {Promise} Resolves to document details.
 */
export function getDocument(id) {
  return axiosInstance.get(`/api/documents/${id}`);
}

/**
 * Deletes a document and its parsed chunks.
 * Method: DELETE /api/documents/:id
 * 
 * @param {number} id - Document ID.
 * @returns {Promise} Resolves to success message.
 */
export function deleteDocument(id) {
  return axiosInstance.delete(`/api/documents/${id}`);
}

/**
 * Retrieves the message history for a given document.
 * Method: GET /api/documents/:documentId/chat
 * 
 * @param {number} documentId - Document ID.
 * @returns {Promise} Resolves to chat history.
 */
export function getChatHistory(documentId) {
  return axiosInstance.get(`/api/documents/${documentId}/chat`);
}

/**
 * Initiates an SSE stream for chat completions.
 * Method: POST /api/chat/stream
 * 
 * @param {object} payload - { documentId: number, message: string, model?: string }
 * @param {object} callbacks - { onToken: Function, onMetadata: Function, onDone: Function, onError: Function }
 * @returns {AbortController} Use to abort/cancel the stream.
 */
export function streamChatMessage({ documentId, message, model }, { onToken, onMetadata, onDone, onError }) {
  // Client-side validations
  if (typeof documentId !== 'number' || documentId <= 0) {
    throw new Error('Invalid document ID');
  }
  if (!message || typeof message !== 'string' || message.length < 1 || message.length > 2000) {
    throw new Error('Message must be between 1 and 2000 characters');
  }

  const abortController = new AbortController();

  (async () => {
    try {
      const response = await fetch(`${baseURL}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documentId, message, model }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          errorData = { error: `HTTP error! status: ${response.status}`, statusCode: response.status };
        }
        throw errorData;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      const processBlock = (block) => {
        if (!block.trim()) return;

        let eventName = 'message';
        let dataText = '';

        const lines = block.split('\n');
        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventName = line.substring(6).trim();
          } else if (line.startsWith('data:')) {
            dataText = line.substring(5).trim();
          }
        }

        if (eventName === 'token') {
          try {
            let tokenVal = dataText;
            if (dataText.startsWith('"') && dataText.endsWith('"')) {
              tokenVal = JSON.parse(dataText);
            }
            onToken(tokenVal);
          } catch {
            onToken(dataText);
          }
        } else if (eventName === 'metadata') {
          try {
            const metaObj = JSON.parse(dataText);
            onMetadata(metaObj.chunks || metaObj);
          } catch (e) {
            console.error('Failed to parse metadata SSE event', e);
          }
        } else if (eventName === 'done') {
          onDone();
        } else if (eventName === 'error') {
          try {
            const errObj = JSON.parse(dataText);
            onError(errObj);
          } catch {
            onError({ error: dataText });
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          processBlock(block);
        }
      }

      if (buffer.trim()) {
        processBlock(buffer);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        return; // Normal cancellation
      }
      onError(err);
    }
  })();

  return abortController;
}
