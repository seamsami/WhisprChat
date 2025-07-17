async function handler({
  chatId,
  backupType = "chat_specific",
  includeMedia = true,
}) {
  const session = getSession();

  if (!session) {
    return { error: "Not authenticated" };
  }

  if (!["full", "chat_specific"].includes(backupType)) {
    return { error: "Backup type must be 'full' or 'chat_specific'" };
  }

  if (backupType === "chat_specific" && !chatId) {
    return { error: "Chat ID is required for chat-specific backup" };
  }

  try {
    let chatData = [];
    let messageCount = 0;

    if (backupType === "full") {
      const userChats = await sql`
        SELECT 
          c.id,
          c.chat_type,
          c.name,
          c.description,
          c.profile_picture,
          c.created_at,
          c.updated_at,
          cp.role,
          cp.joined_at
        FROM chats c
        JOIN chat_participants cp ON c.id = cp.chat_id
        WHERE cp.user_id = ${session.user.id}
        ORDER BY c.updated_at DESC
      `;

      for (const chat of userChats) {
        const messages = await sql`
          SELECT 
            m.id,
            m.message_type,
            m.content,
            m.media_url,
            m.media_type,
            m.file_name,
            m.file_size,
            m.is_edited,
            m.is_deleted,
            m.created_at,
            m.updated_at,
            COALESCE(up.display_name, au.name, au.email) as sender_name,
            up.profile_picture as sender_profile_picture,
            reply_msg.content as reply_to_content
          FROM messages m
          JOIN auth_users au ON m.sender_id = au.id
          LEFT JOIN user_profiles up ON au.id = up.user_id
          LEFT JOIN messages reply_msg ON m.reply_to_message_id = reply_msg.id
          WHERE m.chat_id = ${chat.id}
          ORDER BY m.created_at ASC
        `;

        const reactions = await sql`
          SELECT 
            mr.message_id,
            mr.emoji,
            COALESCE(up.display_name, au.name, au.email) as user_name
          FROM message_reactions mr
          JOIN auth_users au ON mr.user_id = au.id
          LEFT JOIN user_profiles up ON au.id = up.user_id
          WHERE mr.message_id IN (${
            messages.map((m) => m.id).join(",") || "NULL"
          })
        `;

        const reactionsByMessage = {};
        reactions.forEach((r) => {
          if (!reactionsByMessage[r.message_id]) {
            reactionsByMessage[r.message_id] = [];
          }
          reactionsByMessage[r.message_id].push({
            emoji: r.emoji,
            user_name: r.user_name,
          });
        });

        const messagesWithReactions = messages.map((msg) => ({
          ...msg,
          reactions: reactionsByMessage[msg.id] || [],
        }));

        chatData.push({
          chat: chat,
          messages: messagesWithReactions,
          message_count: messages.length,
        });

        messageCount += messages.length;
      }
    } else {
      const chatAccess = await sql`
        SELECT 
          c.id,
          c.chat_type,
          c.name,
          c.description,
          c.profile_picture,
          c.created_at,
          c.updated_at,
          cp.role,
          cp.joined_at
        FROM chats c
        JOIN chat_participants cp ON c.id = cp.chat_id
        WHERE c.id = ${chatId} AND cp.user_id = ${session.user.id}
      `;

      if (chatAccess.length === 0) {
        return { error: "Chat not found or access denied" };
      }

      const chat = chatAccess[0];

      const messages = await sql`
        SELECT 
          m.id,
          m.message_type,
          m.content,
          m.media_url,
          m.media_type,
          m.file_name,
          m.file_size,
          m.is_edited,
          m.is_deleted,
          m.created_at,
          m.updated_at,
          COALESCE(up.display_name, au.name, au.email) as sender_name,
          up.profile_picture as sender_profile_picture,
          reply_msg.content as reply_to_content
        FROM messages m
        JOIN auth_users au ON m.sender_id = au.id
        LEFT JOIN user_profiles up ON au.id = up.user_id
        LEFT JOIN messages reply_msg ON m.reply_to_message_id = reply_msg.id
        WHERE m.chat_id = ${chatId}
        ORDER BY m.created_at ASC
      `;

      const reactions = await sql`
        SELECT 
          mr.message_id,
          mr.emoji,
          COALESCE(up.display_name, au.name, au.email) as user_name
        FROM message_reactions mr
        JOIN auth_users au ON mr.user_id = au.id
        LEFT JOIN user_profiles up ON au.id = up.user_id
        WHERE mr.message_id IN (${
          messages.map((m) => m.id).join(",") || "NULL"
        })
      `;

      const reactionsByMessage = {};
      reactions.forEach((r) => {
        if (!reactionsByMessage[r.message_id]) {
          reactionsByMessage[r.message_id] = [];
        }
        reactionsByMessage[r.message_id].push({
          emoji: r.emoji,
          user_name: r.user_name,
        });
      });

      const messagesWithReactions = messages.map((msg) => ({
        ...msg,
        reactions: reactionsByMessage[msg.id] || [],
      }));

      chatData.push({
        chat: chat,
        messages: messagesWithReactions,
        message_count: messages.length,
      });

      messageCount = messages.length;
    }

    const backupData = {
      backup_info: {
        type: backupType,
        created_at: new Date().toISOString(),
        user_id: session.user.id,
        user_name: session.user.name || session.user.email,
        total_chats: chatData.length,
        total_messages: messageCount,
        include_media: includeMedia,
      },
      chats: chatData,
    };

    const jsonString = JSON.stringify(backupData, null, 2);
    const base64Data = Buffer.from(jsonString).toString("base64");

    const uploadResult = await upload({
      base64: `data:application/json;base64,${base64Data}`,
    });

    if (uploadResult.error) {
      return { error: "Failed to create backup file" };
    }

    const backupRecord = await sql`
      INSERT INTO chat_backups (
        user_id,
        chat_id,
        backup_type,
        file_url,
        file_size,
        message_count,
        expires_at
      ) VALUES (
        ${session.user.id},
        ${backupType === "chat_specific" ? chatId : null},
        ${backupType},
        ${uploadResult.url},
        ${jsonString.length},
        ${messageCount},
        ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()}
      )
      RETURNING id, created_at
    `;

    return {
      backup_id: backupRecord[0].id,
      download_url: uploadResult.url,
      backup_type: backupType,
      file_size: jsonString.length,
      message_count: messageCount,
      chat_count: chatData.length,
      created_at: backupRecord[0].created_at,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
  } catch (error) {
    console.error("Error creating chat backup:", error);
    return { error: "Failed to create chat backup" };
  }
}
export async function POST(request) {
  return handler(await request.json());
}