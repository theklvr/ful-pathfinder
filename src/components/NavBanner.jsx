import { formatDistance } from '../routing/format';

function Arrow({ kind }) {
  if (kind === 'arrive') {
    return (
      <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="12" r="7" />
      </svg>
    );
  }
  const rotation = kind === 'right' ? 90 : kind === 'left' ? -90 : 0;
  return (
    <svg
      viewBox="0 0 24 24"
      width="30"
      height="30"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: `rotate(${rotation}deg)` }}
      aria-hidden="true"
    >
      <path d="M12 19V5" />
      <path d="M6 11l6-6 6 6" />
    </svg>
  );
}

function SpeakerIcon({ muted }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 9v6h4l5 5V4L8 9H4z" fill="currentColor" stroke="none" />
      {muted ? (
        <path d="M16 9l6 6M22 9l-6 6" strokeLinecap="round" />
      ) : (
        <path d="M18 8a6 6 0 010 8" strokeLinecap="round" />
      )}
    </svg>
  );
}

export default function NavBanner({ step, distanceToStep, voiceEnabled, onToggleVoice, statusMessage }) {
  return (
    <div className="nav-banner">
      {statusMessage ? (
        <div className="nav-banner-status">{statusMessage}</div>
      ) : (
        <>
          <div className="nav-banner-icon">
            <Arrow kind={step.kind} />
          </div>
          <div className="nav-banner-body">
            {distanceToStep != null && step.kind !== 'arrive' && (
              <div className="nav-banner-distance">{formatDistance(distanceToStep)}</div>
            )}
            <div className="nav-banner-text">{step.text}</div>
          </div>
          <button
            className="nav-banner-voice"
            onClick={onToggleVoice}
            aria-label={voiceEnabled ? 'Mute voice guidance' : 'Unmute voice guidance'}
            aria-pressed={voiceEnabled}
          >
            <SpeakerIcon muted={!voiceEnabled} />
          </button>
        </>
      )}
    </div>
  );
}
