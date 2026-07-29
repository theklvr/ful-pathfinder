import { CATEGORIES } from '../data/categories';

export default function CategoryFilter({ activeCategories, onToggle }) {
  return (
    <div className="category-filter">
      {CATEGORIES.map((c) => (
        <button
          key={c.id}
          type="button"
          className="category-chip"
          data-active={activeCategories.has(c.id)}
          style={{ '--chip-color': c.color }}
          onClick={() => onToggle(c.id)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
