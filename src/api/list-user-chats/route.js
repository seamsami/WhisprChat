async function handler({ userId }) {
  const session = getSession();

  if (!session) {
    return { error: "Not authenticated" };
  }

  if (!userId) {
    return { error: "User ID is required" };
  }

  try {
    const chats = await sql`
      SELECT DISTINCT
        c.id,
        c.chat_type,
        c.name,
        c.description,
        c.profile_picture,
        c.created_at,
        c.updated_at,
        cp.role,
        cp.is_muted,
        cp.last_read_message_id,
        CASE 
          WHEN c.chat_type = 'direct' THEN (
            SELECT COALESCE(up.display_name, au.name, au.email)
            FROM chat_participants cp2
            JOIN auth_users au ON cp2.user_id = au.id
            LEFT JOIN user_profiles up ON au.id = up.user_id
            WHERE cp2.chat_id = c.id AND cp2.user_id != ${userId}
            LIMIT 1
          )
          ELSE c.name
        END as display_name,
        CASE 
          WHEN c.chat_type = 'direct' THEN (
            SELECT up.profile_picture
            FROM chat_participants cp2
            JOIN user_profiles up ON cp2.user_id = up.user_id
            WHERE cp2.chat_id = c.id AND cp2.user_id != ${userId}
            LIMIT 1
          )
          ELSE c.profile_picture
        END as display_picture,
        CASE 
          WHEN c.chat_type = 'direct' THEN (
            SELECT up.is_online
            FROM chat_participants cp2
            JOIN user_profiles up ON cp2.user_id = up.user_id
            WHERE cp2.chat_id = c.id AND cp2.user_id != ${userId}
            LIMIT 1
          )
          ELSE false
        END as is_online,
        (
          SELECT m.content
          FROM messages m
          WHERE m.chat_id = c.id 
            AND m.is_deleted = false
          ORDER BY m.created_at DESC
          LIMIT 1
        ) as last_message,
        (
          SELECT m.created_at
          FROM messages m
          WHERE m.chat_id = c.id 
            AND m.is_deleted = false
          ORDER BY m.created_at DESC
          LIMIT 1
        ) as last_message_time,
        (
          SELECT COUNT(*)
          FROM messages m
          WHERE m.chat_id = c.id 
            AND m.is_deleted = false
            AND m.created_at > COALESCE(
              (SELECT created_at FROM messages WHERE id = cp.last_read_message_id),
              '1970-01-01'::timestamp
            )
            AND m.sender_id != ${userId}
        ) as unread_count,
        (
          SELECT COUNT(*)
          FROM chat_participants cp_count
          WHERE cp_count.chat_id = c.id
        ) as participant_count
      FROM chats c
      JOIN chat_participants cp ON c.id = cp.chat_id
      WHERE cp.user_id = ${userId}
      ORDER BY 
        CASE 
          WHEN (
            SELECT m.created_at
            FROM messages m
            WHERE m.chat_id = c.id 
              AND m.is_deleted = false
            ORDER BY m.created_at DESC
            LIMIT 1
          ) IS NULL THEN c.created_at
          ELSE (
            SELECT m.created_at
            FROM messages m
            WHERE m.chat_id = c.id 
              AND m.is_deleted = false
            ORDER BY m.created_at DESC
            LIMIT 1
          )
        END DESC
    `;

    const formattedChats = chats.map((chat) => ({
      id: chat.id,
      chat_type: chat.chat_type,
      name: chat.display_name,
      description: chat.description,
      profile_picture: chat.display_picture,
      role: chat.role,
      is_muted: chat.is_muted,
      is_online: chat.is_online || false,
      last_message: chat.last_message,
      last_message_time: chat.last_message_time,
      unread_count: parseInt(chat.unread_count) || 0,
      participant_count: parseInt(chat.participant_count) || 0,
      created_at: chat.created_at,
      updated_at: chat.updated_at,
    }));

    return formattedChats;
  } catch (error) {
    console.error("Error fetching user chats:", error);
    return { error: "Failed to fetch chats" };
  }
}
export async function POST(request) {
  return handler(await request.json());
}