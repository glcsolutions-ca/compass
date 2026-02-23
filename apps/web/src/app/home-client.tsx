"use client";

export default function HomeClient() {
  return (
    <main>
      <h1>Compass Platform</h1>
      <p className="helper">Foundation baseline is active.</p>
      <p className="helper">Core system endpoints:</p>
      <ul>
        <li>
          <code>GET /health</code>
        </li>
        <li>
          <code>GET /openapi.json</code>
        </li>
      </ul>
      <p className="helper">
        Build product routes and database schema incrementally on top of this stable baseline.
      </p>
    </main>
  );
}
