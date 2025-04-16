import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export async function GET() {
  try {
    // Get the user's session
    const session = await getServerSession(authOptions);
    
    // Check if user is authenticated
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    // Check if user has admin role
    // This assumes your session.user has a role property
    // You may need to adjust this based on your authentication setup
    if (session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin privileges required' },
        { status: 403 }
      );
    }
    
    // User is authenticated and has admin privileges
    return NextResponse.json({ success: true, user: session.user });
  } catch (error) {
    console.error('Error checking admin authorization:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 