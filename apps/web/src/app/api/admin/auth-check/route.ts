import { NextResponse, NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export async function GET(req: NextRequest) {
  console.log(`[Web API - Admin Auth Check] Received request.`);
  if (!API_BASE_URL) {
    console.error('[Web API - Admin Auth Check] Backend API URL not configured.');
    return NextResponse.json(
      { error: 'Internal server configuration error.' },
      { status: 500 }
    );
  }

  try {
    // 1. Get the session token to forward to the backend API
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    if (!token) {
      console.log('[Web API - Admin Auth Check] No valid session token found.');
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // 2. Call the backend API's session check endpoint
    // Assuming the backend has a route like `/api/auth/check-session` 
    // or `/api/auth/me` that verifies the token and returns user info/status
    const backendCheckUrl = `${API_BASE_URL}/api/auth/check-session`; // Adjust endpoint if needed
    console.log(`[Web API - Admin Auth Check] Checking session via backend: ${backendCheckUrl}`);

    const response = await fetch(backendCheckUrl, {
      headers: {
        'Authorization': `Bearer ${token.accessToken}`, // Forward the token
        'Content-Type': 'application/json',
      },
    });

    // 3. Handle the response from the backend
    if (!response.ok) {
      const errorStatus = response.status;
      const errorBody = await response.json().catch(() => ({ error: 'Backend session check failed' }));
      console.error(`[Web API - Admin Auth Check] Backend API returned error ${errorStatus}:`, errorBody);
      return NextResponse.json(
        { error: errorBody.message || errorBody.error || 'Session validation failed.' },
        { status: errorStatus } // Forward the status (e.g., 401, 403, 500)
      );
    }

    // 4. Backend confirmed session is valid. Check for admin role based on backend response.
    const backendUserData = await response.json();
    console.log('[Web API - Admin Auth Check] Backend session check successful. User data:', backendUserData);

    if (backendUserData?.user?.role !== 'admin') {
      console.log('[Web API - Admin Auth Check] Backend confirmed user is authenticated but not admin.');
      return NextResponse.json(
        { error: 'Admin privileges required' },
        { status: 403 }
      );
    }

    // 5. User is authenticated AND confirmed as admin by the backend
    console.log('[Web API - Admin Auth Check] Admin check successful.');
    return NextResponse.json({ success: true, user: backendUserData.user }); // Return user data from backend

  } catch (error) {
    console.error('[Web API - Admin Auth Check] Error processing request:', error);
    return NextResponse.json(
      { error: 'Internal server error processing admin auth check.' },
      { status: 500 }
    );
  }
} 