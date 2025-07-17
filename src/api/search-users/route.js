async function handler({ query, limit = 10 }) {
  const session = getSession();

  if (!session) {
    return { error: "Not authenticated" };
  }

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return { error: "Search query is required" };
  }

  const searchTerm = query.trim();
  const searchPattern = `%${searchTerm}%`;

  try {
    const users = await sql`
      SELECT DISTINCT
        au.id,
        au.name,
        au.email,
        COALESCE(up.display_name, au.name, au.email) as display_name,
        up.username,
        up.bio,
        up.profile_picture,
        up.status,
        up.is_online,
        up.last_seen,
        up.show_last_seen
      FROM auth_users au
      LEFT JOIN user_profiles up ON au.id = up.user_id
      WHERE au.id != ${session.user.id}
        AND (
          LOWER(au.email) LIKE LOWER(${searchPattern})
          OR LOWER(up.username) LIKE LOWER(${searchPattern})
          OR LOWER(up.display_name) LIKE LOWER(${searchPattern})
          OR LOWER(au.name) LIKE LOWER(${searchPattern})
        )
      ORDER BY 
        CASE 
          WHEN LOWER(au.email) = LOWER(${searchTerm}) THEN 1
          WHEN LOWER(up.username) = LOWER(${searchTerm}) THEN 2
          WHEN LOWER(up.display_name) = LOWER(${searchTerm}) THEN 3
          WHEN LOWER(au.name) = LOWER(${searchTerm}) THEN 4
          ELSE 5
        END,
        up.display_name,
        au.name,
        au.email
      LIMIT ${limit}
    `;

    const formattedUsers = users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      display_name: user.display_name,
      username: user.username,
      bio: user.bio,
      profile_picture: user.profile_picture,
      status: user.status,
      is_online: user.is_online || false,
      last_seen: user.last_seen,
      show_last_seen: user.show_last_seen !== false,
    }));

    return formattedUsers;
  } catch (error) {
    console.error("Error searching users:", error);
    return { error: "Failed to search users" };
  }
}
export async function POST(request) {
  return handler(await request.json());
}