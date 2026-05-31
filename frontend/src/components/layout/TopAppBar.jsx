import useChat from '../../hooks/useChat';
import useDocuments from '../../hooks/useDocuments';

/**
 * Topbar header displaying the dashboard title, navigation headers,
 * and context actions like starting a New Chat session.
 */
const TopAppBar = () => {
  const { clearChat } = useChat();
  const { setActiveDocumentId } = useDocuments();

  const handleNewChat = () => {
    clearChat();
    setActiveDocumentId(null);
  };

  return (
    <header className="bg-surface/40 dark:bg-surface/40 backdrop-blur-xl glass-shimmer fixed top-0 right-0 w-[calc(100%-var(--sidebar-width))] z-40 border-b border-white/10 shadow-sm flex justify-between items-center h-16 px-container-padding-desktop">
      {/* Empty space on the left to push actions to the right */}
      <div className="flex-1"></div>

      {/* Actions / Profile */}
      <div className="flex items-center gap-4">
        <button 
          onClick={handleNewChat}
          className="hover-glow font-label-md text-label-md text-primary border border-outline-variant rounded-full px-4 py-1.5 hover:bg-primary/5 transition-colors flex items-center gap-2 active:scale-95"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Chat
        </button>
        <div className="flex items-center gap-2 text-on-surface-variant select-none">
          <button className="p-1.5 hover:text-primary hover:bg-white/5 rounded-full transition-all">
            <span className="material-symbols-outlined text-[20px]">notifications</span>
          </button>
          <button className="p-1.5 hover:text-primary hover:bg-white/5 rounded-full transition-all">
            <span className="material-symbols-outlined text-[20px]">help_outline</span>
          </button>
        </div>
        <div className="w-8 h-8 rounded-full border border-white/10 overflow-hidden ml-2 select-none">
          <img
            alt="User Avatar"
            className="w-full h-full object-cover"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAVyxBrc9GOexYxRHEh2KmvcWsvV1VmI4Gx-mSWE3-VASq2EMwk5sx8UEycAP3JBcxmE3qAEkrV-C1L4O_f58JTD65jytgELOmsUray05Y8eJC4KQqQIaH7hk7ge1jk61--JytyNUjT99vvnOntje_b4nO4z9Db2FSS_owlUGJGV0GNmqrcqjgj09zTrUPP4wgUubOusaPkOpvhkrQBORLdbBWL27AzW7hdWWOW6xEgdLCgXVv3YvUwSXMHZ3te4axkEXj1CKLZ9Xk"
          />
        </div>
      </div>
    </header>
  );
};

export default TopAppBar;
