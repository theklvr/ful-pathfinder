const TABS = [
  {
    id: 'explore',
    label: 'Explore',
    icon: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
  },
  {
    id: 'you',
    label: 'You',
    icon: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>',
  },
  {
    id: 'contribute',
    label: 'Contribute',
    icon: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  },
];

export default function BottomNav({ activeTab, onSelect }) {
  return (
    <nav className="bottom-nav">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className="bottom-nav-tab"
          data-active={activeTab === tab.id}
          onClick={() => onSelect(tab.id)}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            dangerouslySetInnerHTML={{ __html: tab.icon }}
          />
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
