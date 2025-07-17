async function handler({
  query,
  chatId,
  senderId,
  messageType,
  startDate,
  endDate,
  limit = 50,
  offset = 0,
}) {
  const session = getSession();

  if (!session) {
    return { error: "Not authenticated" };
  }

  if (!query || query.trim().length === 0) {
    return { error: "Search query is required" };
  }

  try {
    let searchQuery = `
      SELECT DISTINCT
        m.id,
        m.content,
        m.message_type,
        m.media_url,
        m.file_name,
        m.created_at,
        m.is_edited,
        m.chat_id,
        au.name as sender_name,
        COALESCE(up.display_name, au.name, au.email) as sender_display_name,
        up.profile_picture as sender_profile_picture,
        CASE 
          WHEN c.chat_type = 'direct' THEN (
            SELECT COALESCE(up2.display_name, au2.name, au2.email)
            FROM chat_participants cp2
            JOIN auth_users au2 ON cp2.user_id = au2.id
            LEFT JOIN user_profiles up2 ON au2.id = up2.user_id
            WHERE cp2.chat_id = c.id AND cp2.user_id != $1
            LIMIT 1
          )
          ELSE c.name
        END as chat_name,
        c.chat_type,
        ts_rank(to_tsvector('english', m.content), plainto_tsquery('english', $2)) as rank
      FROM messages m
      JOIN chats c ON m.chat_id = c.id
      JOIN chat_participants cp ON c.id = cp.chat_id
      JOIN auth_users au ON m.sender_id = au.id
      LEFT JOIN user_profiles up ON au.id = up.user_id
      WHERE cp.user_id = $1
        AND m.is_deleted = false
        AND to_tsvector('english', m.content) @@ plainto_tsquery('english', $2)
    `;

    const queryParams = [session.user.id, query.trim()];
    let paramCount = 2;

    if (chatId) {
      paramCount++;
      searchQuery += ` AND m.chat_id = $${paramCount}`;
      queryParams.push(chatId);
    }

    if (senderId) {
      paramCount++;
      searchQuery += ` AND m.sender_id = $${paramCount}`;
      queryParams.push(senderId);
    }

    if (
      messageType &&
      ["text", "image", "video", "audio", "document", "voice_note"].includes(
        messageType
      )
    ) {
      paramCount++;
      searchQuery += ` AND m.message_type = $${paramCount}`;
      queryParams.push(messageType);
    }

    if (startDate) {
      paramCount++;
      searchQuery += ` AND m.created_at >= $${paramCount}`;
      queryParams.push(startDate);
    }

    if (endDate) {
      paramCount++;
      searchQuery += ` AND m.created_at <= $${paramCount}`;
      queryParams.push(endDate);
    }

    searchQuery += ` ORDER BY rank DESC, m.created_at DESC`;

    paramCount++;
    searchQuery += ` LIMIT $${paramCount}`;
    queryParams.push(limit);

    paramCount++;
    searchQuery += ` OFFSET $${paramCount}`;
    queryParams.push(offset);

    const results = await sql(searchQuery, queryParams);

    let countQuery = `
      SELECT COUNT(DISTINCT m.id) as total
      FROM messages m
      JOIN chats c ON m.chat_id = c.id
      JOIN chat_participants cp ON c.id = cp.chat_id
      WHERE cp.user_id = $1
        AND m.is_deleted = false
        AND to_tsvector('english', m.content) @@ plainto_tsquery('english', $2)
    `;

    const countParams = [session.user.id, query.trim()];
    let countParamCount = 2;

    if (chatId) {
      countParamCount++;
      countQuery += ` AND m.chat_id = $${countParamCount}`;
      countParams.push(chatId);
    }

    if (senderId) {
      countParamCount++;
      countQuery += ` AND m.sender_id = $${countParamCount}`;
      countParams.push(senderId);
    }

    if (
      messageType &&
      ["text", "image", "video", "audio", "document", "voice_note"].includes(
        messageType
      )
    ) {
      countParamCount++;
      countQuery += ` AND m.message_type = $${countParamCount}`;
      countParams.push(messageType);
    }

    if (startDate) {
      countParamCount++;
      countQuery += ` AND m.created_at >= $${countParamCount}`;
      countParams.push(startDate);
    }

    if (endDate) {
      countParamCount++;
      countQuery += ` AND m.created_at <= $${countParamCount}`;
      countParams.push(endDate);
    }

    const countResult = await sql(countQuery, countParams);
    const total = parseInt(countResult[0].total);

    return {
      messages: results.map((msg) => ({
        id: msg.id,
        content: msg.content,
        message_type: msg.message_type,
        media_url: msg.media_url,
        file_name: msg.file_name,
        created_at: msg.created_at,
        is_edited: msg.is_edited,
        chat_id: msg.chat_id,
        chat_name: msg.chat_name,
        chat_type: msg.chat_type,
        sender: {
          name: msg.sender_name,
          display_name: msg.sender_display_name,
          profile_picture: msg.sender_profile_picture,
        },
        relevance_score: parseFloat(msg.rank),
      })),
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + limit < total,
      },
      query: query.trim(),
      filters: {
        chatId,
        senderId,
        messageType,
        startDate,
        endDate,
      },
    };
  } catch (error) {
    console.error("Error searching messages:", error);
    return { error: "Failed to search messages" };
  }
}
export async function POST(request) {
  return handler(await request.json());
}