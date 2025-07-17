async function handler({ chatId, limit = 50, offset = 0, beforeMessageId }) {
  const session = getSession();

  if (!session) {
    return { error: "Not authenticated" };
  }

  if (!chatId) {
    return { error: "Chat ID is required" };
  }

  try {
    const chatCheck = await sql`
      SELECT c.id
      FROM chats c
      JOIN chat_participants cp ON c.id = cp.chat_id
      WHERE c.id = ${chatId} AND cp.user_id = ${session.user.id}
    `;

    if (chatCheck.length === 0) {
      return { error: "Chat not found or user not a participant" };
    }

    let whereClause = "WHERE m.chat_id = $1 AND m.is_deleted = false";
    let queryParams = [chatId];
    let paramCount = 1;

    if (beforeMessageId) {
      paramCount++;
      whereClause += ` AND m.id < $${paramCount}`;
      queryParams.push(beforeMessageId);
    }

    const queryString = `
      SELECT 
        m.id,
        m.chat_id,
        m.sender_id,
        m.message_type,
        m.content,
        m.media_url,
        m.media_type,
        m.file_name,
        m.file_size,
        m.reply_to_message_id,
        m.is_edited,
        m.is_deleted,
        m.disappears_at,
        m.created_at,
        m.updated_at,
        COALESCE(up.display_name, au.name, au.email) as sender_name,
        up.profile_picture as sender_profile_picture,
        vn.duration,
        vn.waveform_data,
        vn.transcription,
        rm.content as reply_content,
        rm.message_type as reply_message_type,
        rm.media_url as reply_media_url,
        COALESCE(rup.display_name, rau.name, rau.email) as reply_sender_name
      FROM messages m
      JOIN auth_users au ON m.sender_id = au.id
      LEFT JOIN user_profiles up ON au.id = up.user_id
      LEFT JOIN voice_notes vn ON m.id = vn.message_id
      LEFT JOIN messages rm ON m.reply_to_message_id = rm.id
      LEFT JOIN auth_users rau ON rm.sender_id = rau.id
      LEFT JOIN user_profiles rup ON rau.id = rup.user_id
      ${whereClause}
      ORDER BY m.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(limit, offset);

    const messages = await sql(queryString, queryParams);

    const formattedMessages = messages.map((message) => ({
      id: message.id,
      chat_id: message.chat_id,
      sender_id: message.sender_id,
      sender_name: message.sender_name,
      sender_profile_picture: message.sender_profile_picture,
      message_type: message.message_type,
      content: message.content,
      media_url: message.media_url,
      media_type: message.media_type,
      file_name: message.file_name,
      file_size: message.file_size,
      reply_to_message_id: message.reply_to_message_id,
      reply_content: message.reply_content,
      reply_message_type: message.reply_message_type,
      reply_media_url: message.reply_media_url,
      reply_sender_name: message.reply_sender_name,
      is_edited: message.is_edited,
      is_deleted: message.is_deleted,
      disappears_at: message.disappears_at,
      voice_note: message.duration
        ? {
            duration: message.duration,
            waveform_data: message.waveform_data,
            transcription: message.transcription,
          }
        : null,
      created_at: message.created_at,
      updated_at: message.updated_at,
    }));

    if (messages.length > 0) {
      const latestMessageId = messages[0].id;

      await sql`
        INSERT INTO message_receipts (message_id, user_id, read_at)
        VALUES (${latestMessageId}, ${session.user.id}, now())
        ON CONFLICT (message_id, user_id) 
        DO UPDATE SET read_at = now()
      `;

      await sql`
        UPDATE chat_participants 
        SET last_read_message_id = ${latestMessageId}
        WHERE chat_id = ${chatId} AND user_id = ${session.user.id}
      `;
    }

    return {
      messages: formattedMessages,
      has_more: messages.length === limit,
      total_count: messages.length,
    };
  } catch (error) {
    console.error("Error fetching chat messages:", error);
    return { error: "Failed to fetch messages" };
  }
}
export async function POST(request) {
  return handler(await request.json());
}