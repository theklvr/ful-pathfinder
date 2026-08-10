import { useEffect, useRef, useState } from 'react';
import { createShare, stopShare, updateSharePosition, fetchMyActiveShare } from '../data/locationShares';

// Writing every raw GPS tick (as often as once a second) would hammer the
// DB for no real benefit -- a friend watching the link doesn't need
// second-by-second precision.
const WRITE_INTERVAL_MS = 15000;

// Lives at the App level (not inside a tab component) so sharing keeps
// updating even if the user switches away from the You tab -- a share tied
// to a mounted component would silently stop the moment its component
// unmounts, which isn't what "share my location" should mean.
export function useLocationSharing(user) {
  const [shareId, setShareId] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [starting, setStarting] = useState(false);
  const lastWriteRef = useRef(0);

  // Restore an in-progress share after a page reload, rather than silently
  // losing it.
  useEffect(() => {
    if (!user) return;
    fetchMyActiveShare(user.id)
      .then((share) => {
        if (share) {
          setShareId(share.id);
          setExpiresAt(share.expires_at);
        }
      })
      .catch(() => {});
  }, [user]);

  async function start(position) {
    if (!user || !position || starting) return;
    setStarting(true);
    try {
      const share = await createShare(user.id, position.lat, position.lng);
      setShareId(share.id);
      setExpiresAt(share.expires_at);
      lastWriteRef.current = Date.now();
    } finally {
      setStarting(false);
    }
  }

  async function stop() {
    if (!shareId) return;
    const id = shareId;
    setShareId(null);
    setExpiresAt(null);
    await stopShare(id);
  }

  // Called with every live position update while sharing is active;
  // throttles the actual writes internally.
  function reportPosition(position) {
    if (!shareId || !position) return;
    const now = Date.now();
    if (now - lastWriteRef.current < WRITE_INTERVAL_MS) return;
    lastWriteRef.current = now;
    updateSharePosition(shareId, position.lat, position.lng).catch(() => {});
  }

  return { shareId, expiresAt, starting, start, stop, reportPosition };
}
