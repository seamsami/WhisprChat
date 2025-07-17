async function handler({
  chatType,
  name,
  description,
  participantUserIds,
  profilePicture,
  isEncrypted = true,
  disappearingTimer,
  theme = "default",
  wallpaper,
}) {
  const session = getSession();

  if (!session) {
    return { error: "Not authenticated" };
  }

  if (!chatType || !["direct", "group", "channel"].includes(chatType)) {
    return { error: "Valid chat type is required (direct, group, or channel)" };
  }

  if (
    !participantUserIds ||
    !Array.isArray(participantUserIds) ||
    participantUserIds.length === 0
  ) {
    return { error: "At least one participant user ID is required" };
  }

  if (chatType === "direct" && participantUserIds.length !== 1) {
    return { error: "Direct chats must have exactly one other participant" };
  }

  if ((chatType === "group" || chatType === "channel") && !name) {
    return { error: "Name is required for groups and channels" };
  }

  try {
    const allParticipantIds = [
      ...new Set([session.user.id, ...participantUserIds]),
    ];

    const userCheck = await sql`
      SELECT id FROM auth_users 
      WHERE id = ANY(${allParticipantIds})
    `;

    if (userCheck.length !== allParticipantIds.length) {
      return { error: "One or more participant users not found" };
    }

    if (chatType === "direct") {
      const existingDirectChat = await sql`
        SELECT c.id 
        FROM chats c
        JOIN chat_participants cp1 ON c.id = cp1.chat_id
        JOIN chat_participants cp2 ON c.id = cp2.chat_id
        WHERE c.chat_type = 'direct'
          AND cp1.user_id = ${session.user.id}
          AND cp2.user_id = ${participantUserIds[0]}
          AND (
            SELECT COUNT(*) FROM chat_participants 
            WHERE chat_id = c.id
          ) = 2
      `;

      if (existingDirectChat.length > 0) {
        return { error: "Direct chat already exists between these users" };
      }
    }

    const chatQueries = [];
    const participantQueries = [];

    const chatQuery = sql`
      INSERT INTO chats (
        chat_type, 
        name, 
        description, 
        profile_picture, 
        created_by, 
        is_encrypted, 
        disappearing_timer, 
        theme, 
        wallpaper
      ) VALUES (
        ${chatType}, 
        ${name || null}, 
        ${description || null}, 
        ${profilePicture || null}, 
        ${session.user.id}, 
        ${isEncrypted}, 
        ${disappearingTimer || null}, 
        ${theme}, 
        ${wallpaper || null}
      ) RETURNING *
    `;

    chatQueries.push(chatQuery);

    const [chatResults] = await sql.transaction(chatQueries);
    const newChat = chatResults[0];

    for (let i = 0; i < allParticipantIds.length; i++) {
      const userId = allParticipantIds[i];
      const role = userId === session.user.id ? "admin" : "member";

      participantQueries.push(sql`
        INSERT INTO chat_participants (chat_id, user_id, role)
        VALUES (${newChat.id}, ${userId}, ${role})
      `);
    }

    await sql.transaction(participantQueries);

    const chatWithParticipants = await sql`
      SELECT 
        c.*,
        CASE 
          WHEN c.chat_type = 'direct' THEN (
            SELECT COALESCE(up.display_name, au.name, au.email)
            FROM chat_participants cp
            JOIN auth_users au ON cp.user_id = au.id
            LEFT JOIN user_profiles up ON au.id = up.user_id
            WHERE cp.chat_id = c.id AND cp.user_id != ${session.user.id}
            LIMIT 1
          )
          ELSE c.name
        END as display_name,
        CASE 
          WHEN c.chat_type = 'direct' THEN (
            SELECT up.profile_picture
            FROM chat_participants cp
            JOIN user_profiles up ON cp.user_id = up.user_id
            WHERE cp.chat_id = c.id AND cp.user_id != ${session.user.id}
            LIMIT 1
          )
          ELSE c.profile_picture
        END as display_picture,
        (
          SELECT COUNT(*)
          FROM chat_participants cp
          WHERE cp.chat_id = c.id
        ) as participant_count
      FROM chats c
      WHERE c.id = ${newChat.id}
    `;

    const participants = await sql`
      SELECT 
        cp.user_id,
        cp.role,
        COALESCE(up.display_name, au.name, au.email) as name,
        up.profile_picture,
        au.email
      FROM chat_participants cp
      JOIN auth_users au ON cp.user_id = au.id
      LEFT JOIN user_profiles up ON au.id = up.user_id
      WHERE cp.chat_id = ${newChat.id}
      ORDER BY cp.role DESC, cp.joined_at ASC
    `;

    return {
      id: chatWithParticipants[0].id,
      chat_type: chatWithParticipants[0].chat_type,
      name: chatWithParticipants[0].display_name,
      description: chatWithParticipants[0].description,
      profile_picture: chatWithParticipants[0].display_picture,
      is_encrypted: chatWithParticipants[0].is_encrypted,
      disappearing_timer: chatWithParticipants[0].disappearing_timer,
      theme: chatWithParticipants[0].theme,
      wallpaper: chatWithParticipants[0].wallpaper,
      participant_count: parseInt(chatWithParticipants[0].participant_count),
      participants: participants,
      created_at: chatWithParticipants[0].created_at,
      updated_at: chatWithParticipants[0].updated_at,
    };
  } catch (error) {
    console.error("Error creating chat:", error);
    return { error: "Failed to create chat" };
  }
}
export async function POST(request) {
  return handler(await request.json());
}