import { NextResponse } from 'next/server';

// Build ID changes every time the server starts (Docker container restart)
// This allows the client to detect when a new version is deployed.
const buildId = Date.now().toString(36);

/**
 * GET /api/health
 *
 * Health check endpoint for monitoring + update detection.
 * Returns buildId so the client can detect new deployments.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    buildId,
    timestamp: new Date().toISOString(),
  });
}
