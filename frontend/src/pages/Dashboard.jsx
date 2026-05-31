import Sidebar from '../components/layout/Sidebar';
import TopAppBar from '../components/layout/TopAppBar';
import ChatArea from '../components/chat/ChatArea';
import CitationPanel from '../components/documents/CitationPanel';
import { DocumentProvider } from '../context/DocumentContext';
import { ChatProvider } from '../context/ChatContext';
import useChat from '../hooks/useChat';

/**
 * Inner Dashboard layout component consuming the context parameters.
 */
function DashboardContent() {
  const { citations, isCitationPanelOpen, setIsCitationPanelOpen } = useChat();

  return (
    <>
      <Sidebar />
      <main className="ml-sidebar-width w-[calc(100%-var(--sidebar-width))] h-screen flex flex-col relative">
        <TopAppBar />
        
        {/* MAIN LAYOUT */}
        <div className="pt-16 h-full flex w-full overflow-hidden">
          <ChatArea />
          {isCitationPanelOpen && (
            <CitationPanel 
              citations={citations} 
              onClose={() => setIsCitationPanelOpen(false)} 
            />
          )}
        </div>
      </main>

      {/* Subtle atmospheric grain overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.015] mix-blend-overlay z-50"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")'
        }}
      ></div>
    </>
  );
}

/**
 * Main Page dashboard wrapper injecting the Document and Chat context providers.
 */
const Dashboard = () => {
  return (
    <DocumentProvider>
      <ChatProvider>
        <DashboardContent />
      </ChatProvider>
    </DocumentProvider>
  );
};

export default Dashboard;
