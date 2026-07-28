// Matches the category enum in docs/SURVEY-GUIDE.md / supabase/migrations.
export const CATEGORIES = [
  { id: 'faculty', label: 'Faculty', color: '#2563eb' },
  { id: 'hostel', label: 'Hostel', color: '#7c3aed' },
  { id: 'admin', label: 'Admin', color: '#0891b2' },
  { id: 'eatery', label: 'Eatery', color: '#ea580c' },
  { id: 'atm', label: 'ATM', color: '#16a34a' },
  { id: 'landmark', label: 'Landmark', color: '#64748b' },
  { id: 'service', label: 'Service', color: '#ca8a04' },
  { id: 'health', label: 'Health', color: '#dc2626' },
  { id: 'sport', label: 'Sport', color: '#0d9488' },
];

export const CATEGORY_COLOR = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.color]));
export const DEFAULT_MARKER_COLOR = '#475569';
