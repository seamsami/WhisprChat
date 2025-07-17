import { NextResponse } from 'next/server';
import { verifyToken } from '../../../utilities/auth';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    const token = cookies().get('user_token')?.value;
    const user = await verifyToken(token);

    return NextResponse.json({
      isAuthenticated: !!user,
      user: user ? { id: user.userId, email: user.email, role: user.role } : null
    });
  } catch (error) {
    console.error('Authentication check error:', error);
    return NextResponse.json({ isAuthenticated: false }, { status: 401 });
  }
}

