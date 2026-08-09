import { formatDistance, formatDuration } from '../routing/format';

export default function NavBottomBar({ destination, remainingDistanceM, unit = 'metric', onEnd }) {
  return (
    <div className="nav-bottom-bar">
      <div className="nav-bottom-info">
        <span className="nav-bottom-eta">{formatDuration(remainingDistanceM)}</span>
        <span className="nav-bottom-detail">
          {formatDistance(remainingDistanceM, unit)} · to {destination.name}
        </span>
      </div>
      <button className="nav-bottom-end" onClick={onEnd}>
        End
      </button>
    </div>
  );
}
