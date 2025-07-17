import { jwtVerify, SignJWT } from 'jose';
import { cookies } from 'next/headers';

// Edge Runtime compatible token verification
export async function verifyToken(token) {
  if (!token) return null;

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);

    // Check token expiration
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return null;
    }

    return payload;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

// Edge Runtime compatible token generation
export async function generateToken(user, expiresIn = '1h') {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  
  return await new SignJWT({
    userId: user.id,
    email: user.email,
    role: user.role || 'user'
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expiresIn)
    .sign(secret);
}

// Cookie management remains the same
export async function setTokenCookie(token) {
  cookies().set('user_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 3600 // 1 hour
  });
}

export async function clearTokenCookie() {
  cookies().delete('user_token');
}

