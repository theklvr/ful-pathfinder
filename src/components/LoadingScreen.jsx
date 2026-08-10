export default function LoadingScreen() {
  return (
    <div className="loading-screen">
      <img className="loading-logo" src="/logo.png" alt="Federal University Lokoja" />
      <div className="loading-spinner" />
      <p>Loading campus map…</p>
    </div>
  );
}
