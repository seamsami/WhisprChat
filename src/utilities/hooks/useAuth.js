import { useState, useEffect } from "react";

export function useAuth() {
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    // Check if token exists in cookies
    const checkAuthentication = async () => {
      try {
        const response = await fetch('/api/check-auth');
        const { isAuthenticated } = await response.json();
        setAuthenticated(isAuthenticated);
      } catch (error) {
        console.error('Authentication check failed', error);
        setAuthenticated(false);
      }
    };

    checkAuthentication();
  }, []);

  const signOut = async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (response.ok) {
        setAuthenticated(false);
      }
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  return { authenticated, signOut };
}
