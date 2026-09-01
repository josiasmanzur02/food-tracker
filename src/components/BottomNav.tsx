import type { AppPage } from '../types';

interface BottomNavProps {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
}

const NAV_ITEMS: Array<{
  page: AppPage;
  label: string;
  icon: JSX.Element;
}> = [
  {
    page: 'today',
    label: 'Today',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 4h12a2 2 0 0 1 2 2v12.5A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5V6a2 2 0 0 1 2-2Z" />
        <path d="M8 3v4M16 3v4M8 11h8M8 15h5" />
      </svg>
    )
  },
  {
    page: 'progress',
    label: 'Progress',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 17.5 10 12l3.2 3.2L19 8.5" />
        <path d="M19 8.5V14M19 8.5h-5.5" />
      </svg>
    )
  },
  {
    page: 'history',
    label: 'History',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 7v5l3 2" />
        <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
        <path d="M4.5 6.7V12h5.3" />
      </svg>
    )
  },
  {
    page: 'settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 9.25A2.75 2.75 0 1 1 9.25 12 2.75 2.75 0 0 1 12 9.25Z" />
        <path d="m4.8 13.2 1.1.5.4 1.2-.7 1.1 1.6 1.6 1.1-.7 1.2.4.5 1.1h2.2l.5-1.1 1.2-.4 1.1.7 1.6-1.6-.7-1.1.4-1.2 1.1-.5v-2.2l-1.1-.5-.4-1.2.7-1.1-1.6-1.6-1.1.7-1.2-.4-.5-1.1h-2.2l-.5 1.1-1.2.4-1.1-.7-1.6 1.6.7 1.1-.4 1.2-1.1.5Z" />
      </svg>
    )
  }
];

export function BottomNav({ activePage, onNavigate }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {NAV_ITEMS.map((item) => {
        const isActive = item.page === activePage;

        return (
          <button
            key={item.page}
            type="button"
            className={`bottom-nav__item ${isActive ? 'bottom-nav__item--active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onNavigate(item.page)}
          >
            <span className="bottom-nav__icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
