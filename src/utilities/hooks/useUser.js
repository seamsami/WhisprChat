import { useState, useEffect } from "react";

export function useUser() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate user fetch
    const fakeUser = {
      id: "123",
      name: "Test User",
      email: "test@example.com",
    };

    setTimeout(() => {
      setUser(fakeUser);
      setLoading(false);
    }, 1000); // simulate async load
  }, []);

  return { data: user, loading };
}
