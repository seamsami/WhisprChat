import { useState } from "react";

export function useAuth() {
  const [authenticated, setAuthenticated] = useState(true);

  const signOut = () => {
    console.log("Signed out");
    setAuthenticated(false);
  };

  return { authenticated, signOut };
}
