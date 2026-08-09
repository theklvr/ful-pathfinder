import { useEffect, useState } from 'react';
import { fetchProfile } from '../data/profiles';

// Shared between the account button (shows the avatar at a glance) and
// AccountPanel (edits it), so a save in the panel updates the button too
// without a second fetch.
export function useProfile(user) {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    fetchProfile(user.id)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  return [profile, setProfile];
}
