async function handler({ isOnline, lastSeen }) {
  const session = getSession();

  if (!session) {
    return { error: "Not authenticated" };
  }

  try {
    const now = new Date().toISOString();
    const lastSeenTimestamp = lastSeen || now;

    const updatedProfile = await sql`
      UPDATE user_profiles 
      SET 
        is_online = ${isOnline !== undefined ? isOnline : true},
        last_seen = ${lastSeenTimestamp},
        updated_at = ${now}
      WHERE user_id = ${session.user.id}
      RETURNING 
        user_id,
        display_name,
        is_online,
        last_seen,
        show_last_seen,
        updated_at
    `;

    if (updatedProfile.length === 0) {
      const newProfile = await sql`
        INSERT INTO user_profiles (
          user_id,
          is_online,
          last_seen,
          created_at,
          updated_at
        ) VALUES (
          ${session.user.id},
          ${isOnline !== undefined ? isOnline : true},
          ${lastSeenTimestamp},
          ${now},
          ${now}
        )
        RETURNING 
          user_id,
          display_name,
          is_online,
          last_seen,
          show_last_seen,
          updated_at
      `;

      return {
        user_id: newProfile[0].user_id,
        display_name: newProfile[0].display_name,
        is_online: newProfile[0].is_online,
        last_seen: newProfile[0].last_seen,
        show_last_seen: newProfile[0].show_last_seen,
        updated_at: newProfile[0].updated_at,
      };
    }

    return {
      user_id: updatedProfile[0].user_id,
      display_name: updatedProfile[0].display_name,
      is_online: updatedProfile[0].is_online,
      last_seen: updatedProfile[0].last_seen,
      show_last_seen: updatedProfile[0].show_last_seen,
      updated_at: updatedProfile[0].updated_at,
    };
  } catch (error) {
    console.error("Error updating user status:", error);
    return { error: "Failed to update user status" };
  }
}
export async function POST(request) {
  return handler(await request.json());
}