import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

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
    if (session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin privileges required' },
        { status: 403 }
      );
    }
    
    // Fetch stats from database
    const userCount = await prisma.user.count();
    const documentCount = await prisma.document.count();
    const chatCount = await prisma.chat.count();
    
    // Return stats
    return NextResponse.json({
      users: userCount,
      documents: documentCount,
      chats: chatCount,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 