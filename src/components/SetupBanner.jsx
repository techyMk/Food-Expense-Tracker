export default function SetupBanner() {
  return (
    <div className="setup-wrap">
      <div className="card setup-card">
        <h1>🔧 Almost there</h1>
        <p>Connect a Neon database to start tracking.</p>
        <ol>
          <li>Create a free project at <strong>neon.tech</strong>.</li>
          <li>Click <strong>Connect</strong> and copy the connection string.</li>
          <li>Paste it as <code>NEON_DATABASE_URL</code> in the <code>.env</code> file, and set a <code>JWT_SECRET</code> (any long random string).</li>
          <li>Run <code>npm run dev</code> again — the tables are created automatically.</li>
        </ol>
        <p className="muted">Full steps are in <code>SETUP.md</code>. If you just edited <code>.env</code>, restart the server.</p>
      </div>
    </div>
  );
}
