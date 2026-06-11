import { useState, useEffect } from 'react';
import useChat from '../../hooks/useChat';
import useDocuments from '../../hooks/useDocuments';
import ChatHeader from './ChatHeader';
import ChatScrollArea from './ChatScrollArea';
import ChatInputBar from './ChatInputBar';
import DocumentManagerLanding from '../documents/DocumentManagerLanding';

/**
 * ChatCanvas component coordinating prompt inputs, scrolling history feeds,
 * and context selection headers.
 */
export default function ChatArea() {
  const { documents, activeDocumentId } = useDocuments();
  const {
    messages,
    isGenerating,
    model,
    setModel,
    tokenStats,
    loadHistory,
    sendMessage,
    isCitationPanelOpen,
    setIsCitationPanelOpen,
    setCitations
  } = useChat();

  const [inputVal, setInputVal] = useState('');

  // Automatically load chat history when the selected document changes
  useEffect(() => {
    if (activeDocumentId) {
      loadHistory(activeDocumentId);
    }
  }, [activeDocumentId, loadHistory]);

  const activeDoc = documents.find((doc) => doc.id === activeDocumentId);
  const activeDocName = activeDoc ? (activeDoc.original_name || activeDoc.originalName || activeDoc.filename || activeDoc.fileName) : null;

  const handleSubmit = () => {
    if (inputVal.trim() && !isGenerating && activeDocumentId) {
      sendMessage(inputVal, activeDocumentId);
      setInputVal('');
    }
  };

  if (!activeDocumentId) {
    return <DocumentManagerLanding />;
  }

  return (
    <section className="flex-1 flex flex-col relative min-w-0 bg-background overflow-hidden animate-enter">
      <ChatHeader
        activeDocumentName={activeDocName}
        model={model}
        onModelChange={setModel}
        isCitationPanelOpen={isCitationPanelOpen}
        onToggleCitationPanel={() => setIsCitationPanelOpen(!isCitationPanelOpen)}
      />

      <ChatScrollArea
        messages={messages}
        isGenerating={isGenerating}
        onViewSources={(citations) => {
          setCitations(citations);
          setIsCitationPanelOpen(true);
        }}
      />

      <ChatInputBar
        value={inputVal}
        onChange={setInputVal}
        onSubmit={handleSubmit}
        isDisabled={isGenerating}
        tokenCount={tokenStats.count}
        tokensPerSecond={tokenStats.speed}
      />
    </section>
  );
}
