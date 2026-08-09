import { useState } from 'react';
import { CATEGORIES } from '../data/categories';

export default function CategoryFilter({ activeCategory, onSelect }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="category-filter-row">
      <button
        type="button"
        className="category-filter-toggle"
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Show categories' : 'Hide categories'}
        onClick={() => setCollapsed((v) => !v)}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: collapsed ? 'rotate(-90deg)' : 'none' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {!collapsed && (
        <div className="category-filter">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className="category-chip"
              data-active={activeCategory === c.id}
              style={{ '--chip-color': c.color }}
              onClick={() => onSelect(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
