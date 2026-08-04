import { useEffect, useState } from 'react';
import { fetchReviews, upsertReview } from '../data/reviews';
import Stars from './Stars';

export default function PlaceReviews({ place, user, onRequireSignIn }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myRating, setMyRating] = useState(0);
  const [myComment, setMyComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchReviews(place.id).then((data) => {
      if (cancelled) return;
      setReviews(data);
      setLoading(false);
      const mine = user ? data.find((r) => r.user_id === user.id) : null;
      setMyRating(mine?.rating ?? 0);
      setMyComment(mine?.comment ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [place.id, user]);

  const average = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null;

  async function handleSubmit() {
    if (!user) {
      onRequireSignIn?.();
      return;
    }
    if (!myRating) return;
    setSubmitting(true);
    try {
      await upsertReview({ userId: user.id, placeId: place.id, rating: myRating, comment: myComment.trim() || null });
      setReviews(await fetchReviews(place.id));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="place-reviews">
      <div className="place-reviews-summary">
        {average != null ? (
          <>
            <span className="place-reviews-average">{average.toFixed(1)}</span>
            <Stars value={average} readOnly />
            <span className="place-reviews-count">({reviews.length})</span>
          </>
        ) : (
          !loading && <span className="place-reviews-empty">No ratings yet</span>
        )}
      </div>

      <div className="place-reviews-compose">
        <Stars value={myRating} onChange={user ? setMyRating : () => onRequireSignIn?.()} />
        {user ? (
          <>
            <textarea
              className="place-reviews-comment"
              placeholder="Add a comment (optional)"
              value={myComment}
              onChange={(e) => setMyComment(e.target.value)}
            />
            <button type="button" className="place-reviews-submit" disabled={!myRating || submitting} onClick={handleSubmit}>
              {submitting ? 'Saving…' : 'Save review'}
            </button>
          </>
        ) : (
          <button type="button" className="place-reviews-signin" onClick={onRequireSignIn}>
            Sign in to leave a review
          </button>
        )}
      </div>

      {reviews.length > 0 && (
        <ul className="place-reviews-list">
          {reviews.slice(0, 5).map((r) => (
            <li key={r.id}>
              <Stars value={r.rating} readOnly />
              {r.comment && <p>{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
