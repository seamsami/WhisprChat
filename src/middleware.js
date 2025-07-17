import { NextResponse } from "next/server";
import { verifyToken } from './utilities/auth'; // Create this utility

export const config = {
  matcher: [
    '/chat/:path*',
    '/api/:path*',
    '/profile/:path*',
    '/integrations/:path*'
  ],
};

export async function middleware(request) {
  const token = request.cookies.get('user_token')?.value;
  const path = request.nextUrl.pathname;

  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/signup', '/reset-password'];
  
  // Check authentication for protected routes
  if (!publicRoutes.includes(path)) {
    try {
      const user = await verifyToken(token);
      if (!user) {
        return NextResponse.redirect(new URL('/login', request.url));
      }
      
      // Add user information to request headers for backend services
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-user-id', user.id);
      requestHeaders.set('x-user-role', user.role || 'user');

      return NextResponse.next({
        request: {
          headers: requestHeaders
        }
      });
    } catch (error) {
      console.error('Middleware authentication error:', error);
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // Handle rate limiting and security headers
  const response = NextResponse.next();
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  return response;
}
