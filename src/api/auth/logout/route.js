import { NextResponse } from 'next/server';
import { clearTokenCookie } from '../../../utilities/auth';

export async function POST() {
  try {
    // Clear the authentication token
    await clearTokenCookie();

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

