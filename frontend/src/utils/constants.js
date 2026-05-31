export const DOCUMENT_STATUS = {
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
}

export const MODELS = [
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', recommended: true },
  { id: 'llama-3.1-8b-instant',    name: 'Llama 3.1 8B', recommended: false }
]

export const POLL_INTERVAL_MS = 2000
export const MAX_MESSAGE_LENGTH = 2000
export const MAX_FILE_SIZE_MB = 100
export const ACCEPTED_FILE_TYPES = ['application/pdf', 'text/plain']
