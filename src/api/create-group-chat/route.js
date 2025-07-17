async function handler({
  name,
  description,
  participantUserIds,
  profilePicture,
  isEncrypted = true,
  disappearingTimer,
  theme = "default",
  wallpaper,
  settings = {},
}) {
  const session = getSession();

  if (!session) {
    return { error: "Not authenticated" };
  }

  if (!name || name.trim().length === 0) {
    return { error: "Group name is required" };
  }

  if (name.length > 100) {
    return { error: "Group name must be 100 characters or less" };
  }

  if (
    !participantUserIds ||
    !Array.isArray(participantUserIds) ||
    participantUserIds.length === 0
  ) {
    return { error: "At least one participant user ID is required" };
  }

  if (participantUserIds.length > 256) {
    return { error: "Group cannot have more than 256 participants" };
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

    const defaultSettings = {
      auto_delete_timer: null,
      allow_member_invites: true,
      message_history_visible: true,
      only_admins_can_edit_info: false,
      only_admins_can_add_members: false,
      only_admins_can_remove_members: true,
      only_admins_can_delete_messages: false,
      ...settings,
    };

    const chatResult = await sql`
      INSERT INTO chats (
        chat_type, 
        name, 
        description, 
        profile_picture, 
        created_by, 
        is_encrypted, 
        disappearing_timer, 
        theme, 
        wallpaper,
        settings
      ) VALUES (
        'group', 
        ${name.trim()}, 
        ${description || null}, 
        ${profilePicture || null}, 
        ${session.user.id}, 
        ${isEncrypted}, 
        ${disappearingTimer || null}, 
        ${theme}, 
        ${wallpaper || null},
        ${JSON.stringify(defaultSettings)}
      ) RETURNING *
    `;

    const newChat = chatResult[0];

    const participantQueries = [];

    for (let i = 0; i < allParticipantIds.length; i++) {
      const userId = allParticipantIds[i];
      const role = userId === session.user.id ? "admin" : "member";

      const permissions = {
        can_edit_info:
          role === "admin" || !defaultSettings.only_admins_can_edit_info,
        can_add_members:
          role === "admin" ||
          (!defaultSettings.only_admins_can_add_members &&
            defaultSettings.allow_member_invites),
        can_remove_members:
          role === "admin" || !defaultSettings.only_admins_can_remove_members,
        can_delete_messages:
          role === "admin" || !defaultSettings.only_admins_can_delete_messages,
      };

      participantQueries.push(sql`
        INSERT INTO chat_participants (chat_id, user_id, role, permissions)
        VALUES (${newChat.id}, ${userId}, ${role}, ${JSON.stringify(
        permissions
      )})
      `);
    }

    await sql.transaction(participantQueries);

    const chatWithDetails = await sql`
      SELECT 
        c.*,
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
        cp.permissions,
        cp.joined_at,
        COALESCE(up.display_name, au.name, au.email) as name,
        up.profile_picture,
        au.email
      FROM chat_participants cp
      JOIN auth_users au ON cp.user_id = au.id
      LEFT JOIN user_profiles up ON au.id = up.user_id
      WHERE cp.chat_id = ${newChat.id}
      ORDER BY cp.role DESC, cp.joined_at ASC
    `;

    const systemMessage = await sql`
      INSERT INTO messages (
        chat_id,
        sender_id,
        message_type,
        content
      ) VALUES (
        ${newChat.id},
        ${session.user.id},
        'system',
        'Group created'
      ) RETURNING *
    `;

    return {
      id: chatWithDetails[0].id,
      chat_type: chatWithDetails[0].chat_type,
      name: chatWithDetails[0].name,
      description: chatWithDetails[0].description,
      profile_picture: chatWithDetails[0].profile_picture,
      is_encrypted: chatWithDetails[0].is_encrypted,
      disappearing_timer: chatWithDetails[0].disappearing_timer,
      theme: chatWithDetails[0].theme,
      wallpaper: chatWithDetails[0].wallpaper,
      settings: chatWithDetails[0].settings,
      participant_count: parseInt(chatWithDetails[0].participant_count),
      participants: participants.map((p) => ({
        user_id: p.user_id,
        role: p.role,
        permissions: p.permissions,
        name: p.name,
        profile_picture: p.profile_picture,
        email: p.email,
        joined_at: p.joined_at,
      })),
      created_by: chatWithDetails[0].created_by,
      created_at: chatWithDetails[0].created_at,
      updated_at: chatWithDetails[0].updated_at,
    };
  } catch (error) {
    console.error("Error creating group chat:", error);
    return { error: "Failed to create group chat" };
  }
}
export async function POST(request) {
  return handler(await request.json());
}