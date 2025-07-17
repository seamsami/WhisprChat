import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';
import { generateToken, setTokenCookie } from '@/utilities/auth';

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { message: 'Email and password are required' }, 
        { status: 400 }
      );
    }

    // Connect to MongoDB
    const client = await MongoClient.connect(process.env.DATABASE_URL);
    const db = client.db();

    // Find user
    const user = await db.collection('users').findOne({ email });

    if (!user) {
      client.close();
      return NextResponse.json(
        { message: 'Invalid email or password' }, 
        { status: 401 }
      );
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      client.close();
      return NextResponse.json(
        { message: 'Invalid email or password' }, 
        { status: 401 }
      );
    }

    // Generate token
    const token = await generateToken({
      id: user._id,
      email: user.email,
      role: user.role || 'user'
    });

    // Set token in cookie
    const response = NextResponse.json({
      message: 'Login successful',
      user: { 
        id: user._id, 
        email: user.email, 
        name: user.name 
      }
    }, { status: 200 });

    response.cookies.set('user_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600 // 1 hour
    });

    client.close();
    return response;

  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { message: 'Internal server error' }, 
      { status: 500 }
    );
  }
}

