async function handler({ userId }) {
  const session = getSession();

  if (!session) {
    return { error: "Not authenticated" };
  }

  if (!userId) {
    return { error: "User ID is required" };
  }

  try {
    const userProfile = await sql`
      SELECT 
        up.id,
        up.user_id,
        up.display_name,
        up.bio,
        up.profile_picture,
        up.status,
        up.phone_number,
        up.username,
        up.last_seen,
        up.is_online,
        up.show_last_seen,
        up.show_typing_indicator,
        up.anonymous_mode,
        up.created_at,
        up.updated_at,
        au.name,
        au.email
      FROM user_profiles up
      JOIN auth_users au ON up.user_id = au.id
      WHERE up.user_id = ${userId}
    `;

    if (userProfile.length === 0) {
      const user = await sql`
        SELECT id, name, email 
        FROM auth_users 
        WHERE id = ${userId}
      `;

      if (user.length === 0) {
        return { error: "User not found" };
      }

      await sql`
        INSERT INTO user_profiles (
          user_id, 
          display_name, 
          is_online, 
          show_last_seen, 
          show_typing_indicator, 
          anonymous_mode
        ) VALUES (
          ${userId}, 
          ${user[0].name || user[0].email}, 
          false, 
          true, 
          true, 
          false
        )
      `;

      const newProfile = await sql`
        SELECT 
          up.id,
          up.user_id,
          up.display_name,
          up.bio,
          up.profile_picture,
          up.status,
          up.phone_number,
          up.username,
          up.last_seen,
          up.is_online,
          up.show_last_seen,
          up.show_typing_indicator,
          up.anonymous_mode,
          up.created_at,
          up.updated_at,
          au.name,
          au.email
        FROM user_profiles up
        JOIN auth_users au ON up.user_id = au.id
        WHERE up.user_id = ${userId}
      `;

      return newProfile[0];
    }

    return userProfile[0];
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return { error: "Failed to fetch user profile" };
  }
}
export async function POST(request) {
  return handler(await request.json());
}