import { NextResponse, NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt'; // Use getToken to forward credentials if needed

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export async function GET(req: NextRequest) { // Use NextRequest type for req
  console.log(`[Web API - Admin Stats] Received request.`);
  if (!API_BASE_URL) {
    console.error('[Web API - Admin Stats] Backend API URL not configured.');
    return NextResponse.json(
      { error: 'Internal server configuration error.' },
      { status: 500 }
    );
  }

  try {
    // 1. Get the session token to forward to the backend API for authentication/authorization
    // Note: Requires NEXTAUTH_SECRET to be set in the environment
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    if (!token) {
      console.log('[Web API - Admin Stats] No valid session token found.');
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Optionally, check role locally if available in token, but backend *must* re-verify
    if (token.role !== 'admin') {
         console.log('[Web API - Admin Stats] Token exists but user role is not admin.');
        return NextResponse.json(
            { error: 'Admin privileges required' }, 
            { status: 403 } 
        );
    }

    // 2. Fetch stats from the backend API
    const backendStatsUrl = `${API_BASE_URL}/api/admin/stats`; // Assuming backend has this route
    console.log(`[Web API - Admin Stats] Fetching stats from backend: ${backendStatsUrl}`);

    const response = await fetch(backendStatsUrl, {
      headers: {
        // Forward the Authorization header (or relevant cookie/token)
        'Authorization': `Bearer ${token.accessToken}`, // Assuming your backend expects a Bearer token
        'Content-Type': 'application/json',
      },
    });

    // 3. Handle the response from the backend
    if (!response.ok) {
      console.error(`[Web API - Admin Stats] Backend API returned error ${response.status}: ${await response.text()}`);
      // Forward the backend error status and message if possible
      const errorBody = await response.json().catch(() => ({ error: 'Backend API request failed' }));
      return NextResponse.json(
        { error: errorBody.message || errorBody.error || 'Failed to fetch admin stats from backend.' },
        { status: response.status }
      );
    }

    const statsData = await response.json();
    console.log('[Web API - Admin Stats] Received stats from backend:', statsData);

    // 4. Return the data received from the backend
    return NextResponse.json(statsData);

  } catch (error) {
    console.error('[Web API - Admin Stats] Error processing request:', error);
    return NextResponse.json(
      { error: 'Internal server error processing admin stats request.' },
      { status: 500 }
    );
  }
} 