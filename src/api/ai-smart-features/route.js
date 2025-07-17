async function handler({
  action,
  messageId,
  chatId,
  text,
  targetLanguage,
  messageCount = 10,
}) {
  const session = getSession();

  if (!session) {
    return { error: "Not authenticated" };
  }

  if (!action) {
    return { error: "Action is required" };
  }

  try {
    switch (action) {
      case "smart_reply":
        return await generateSmartReplies(chatId, session.user.id);

      case "summarize":
        return await summarizeMessages(chatId, messageCount, session.user.id);

      case "sentiment":
        return await analyzeSentiment(messageId, session.user.id);

      case "translate":
        return await translateMessage(
          messageId,
          targetLanguage,
          session.user.id
        );

      case "auto_complete":
        return await autoCompleteMessage(text, chatId, session.user.id);

      default:
        return { error: "Invalid action" };
    }
  } catch (error) {
    console.error("AI features error:", error);
    return { error: "AI processing failed" };
  }
}

async function generateSmartReplies(chatId, userId) {
  const chatAccess = await sql(
    "SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2",
    [chatId, userId]
  );

  if (chatAccess.length === 0) {
    return { error: "Access denied to this chat" };
  }

  const recentMessages = await sql(
    `
    SELECT m.content, m.message_type, m.created_at,
           COALESCE(up.display_name, au.name) as sender_name
    FROM messages m
    JOIN auth_users au ON m.sender_id = au.id
    LEFT JOIN user_profiles up ON au.id = up.user_id
    WHERE m.chat_id = $1 AND m.is_deleted = false AND m.message_type = 'text'
    ORDER BY m.created_at DESC
    LIMIT 5
  `,
    [chatId]
  );

  if (recentMessages.length === 0) {
    return { replies: ["Hello!", "How are you?", "What's up?"] };
  }

  const context = recentMessages
    .reverse()
    .map((m) => `${m.sender_name}: ${m.content}`)
    .join("\n");

  const prompt = `Based on this conversation context, suggest 3 brief, natural reply options:\n\n${context}\n\nProvide only the reply text, one per line.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 150,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    const replies = data.choices[0].message.content
      .trim()
      .split("\n")
      .filter((r) => r.trim());

    await sql(
      "INSERT INTO ai_interactions (user_id, interaction_type, input_data, output_data, success) VALUES ($1, $2, $3, $4, $5)",
      [userId, "smart_reply", { chatId, context }, { replies }, true]
    );

    return { replies: replies.slice(0, 3) };
  } catch (error) {
    return { replies: ["Thanks!", "Got it", "Sounds good"] };
  }
}

async function summarizeMessages(chatId, messageCount, userId) {
  const chatAccess = await sql(
    "SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2",
    [chatId, userId]
  );

  if (chatAccess.length === 0) {
    return { error: "Access denied to this chat" };
  }

  const messages = await sql(
    `
    SELECT m.content, m.created_at,
           COALESCE(up.display_name, au.name) as sender_name
    FROM messages m
    JOIN auth_users au ON m.sender_id = au.id
    LEFT JOIN user_profiles up ON au.id = up.user_id
    WHERE m.chat_id = $1 AND m.is_deleted = false AND m.message_type = 'text'
    ORDER BY m.created_at DESC
    LIMIT $2
  `,
    [chatId, messageCount]
  );

  if (messages.length === 0) {
    return { summary: "No messages to summarize" };
  }

  const conversation = messages
    .reverse()
    .map((m) => `${m.sender_name}: ${m.content}`)
    .join("\n");

  const prompt = `Summarize this conversation in 2-3 sentences, highlighting key points and decisions:\n\n${conversation}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0.3,
      }),
    });

    const data = await response.json();
    const summary = data.choices[0].message.content.trim();

    await sql(
      "INSERT INTO ai_interactions (user_id, interaction_type, input_data, output_data, success) VALUES ($1, $2, $3, $4, $5)",
      [userId, "summarize", { chatId, messageCount }, { summary }, true]
    );

    return { summary, messageCount: messages.length };
  } catch (error) {
    return { summary: "Unable to generate summary at this time" };
  }
}

async function analyzeSentiment(messageId, userId) {
  const message = await sql(
    `
    SELECT m.content, m.chat_id
    FROM messages m
    JOIN chat_participants cp ON m.chat_id = cp.chat_id
    WHERE m.id = $1 AND cp.user_id = $2 AND m.is_deleted = false AND m.message_type = 'text'
  `,
    [messageId, userId]
  );

  if (message.length === 0) {
    return { error: "Message not found or access denied" };
  }

  const content = message[0].content;

  const prompt = `Analyze the sentiment of this message and respond with only a JSON object containing "sentiment" (positive/negative/neutral), "confidence" (0-1), and "emotions" (array of detected emotions):\n\n"${content}"`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 100,
        temperature: 0.1,
      }),
    });

    const data = await response.json();
    const analysis = JSON.parse(data.choices[0].message.content.trim());

    await sql(
      "INSERT INTO ai_interactions (user_id, interaction_type, input_data, output_data, success) VALUES ($1, $2, $3, $4, $5)",
      [userId, "sentiment", { messageId, content }, analysis, true]
    );

    return { messageId: parseInt(messageId), ...analysis };
  } catch (error) {
    return {
      messageId: parseInt(messageId),
      sentiment: "neutral",
      confidence: 0.5,
      emotions: ["unknown"],
    };
  }
}

async function translateMessage(messageId, targetLanguage, userId) {
  if (!targetLanguage) {
    return { error: "Target language is required" };
  }

  const message = await sql(
    `
    SELECT m.content, m.chat_id
    FROM messages m
    JOIN chat_participants cp ON m.chat_id = cp.chat_id
    WHERE m.id = $1 AND cp.user_id = $2 AND m.is_deleted = false AND m.message_type = 'text'
  `,
    [messageId, userId]
  );

  if (message.length === 0) {
    return { error: "Message not found or access denied" };
  }

  const content = message[0].content;

  const existingTranslation = await sql(
    "SELECT translated_text FROM message_translations WHERE message_id = $1 AND user_id = $2 AND target_language = $3",
    [messageId, userId, targetLanguage]
  );

  if (existingTranslation.length > 0) {
    return {
      messageId: parseInt(messageId),
      originalText: content,
      translatedText: existingTranslation[0].translated_text,
      targetLanguage,
      cached: true,
    };
  }

  const prompt = `Translate this text to ${targetLanguage}. Respond with only the translated text:\n\n"${content}"`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0.1,
      }),
    });

    const data = await response.json();
    const translatedText = data.choices[0].message.content
      .trim()
      .replace(/^"|"$/g, "");

    await sql(
      "INSERT INTO message_translations (message_id, user_id, target_language, translated_text) VALUES ($1, $2, $3, $4)",
      [messageId, userId, targetLanguage, translatedText]
    );

    await sql(
      "INSERT INTO ai_interactions (user_id, interaction_type, input_data, output_data, success) VALUES ($1, $2, $3, $4, $5)",
      [
        userId,
        "translate",
        { messageId, targetLanguage, content },
        { translatedText },
        true,
      ]
    );

    return {
      messageId: parseInt(messageId),
      originalText: content,
      translatedText,
      targetLanguage,
      cached: false,
    };
  } catch (error) {
    return { error: "Translation failed" };
  }
}

async function autoCompleteMessage(text, chatId, userId) {
  if (!text || text.length < 2) {
    return { suggestions: [] };
  }

  const chatAccess = await sql(
    "SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2",
    [chatId, userId]
  );

  if (chatAccess.length === 0) {
    return { error: "Access denied to this chat" };
  }

  const recentMessages = await sql(
    `
    SELECT m.content
    FROM messages m
    WHERE m.chat_id = $1 AND m.is_deleted = false AND m.message_type = 'text'
    ORDER BY m.created_at DESC
    LIMIT 10
  `,
    [chatId]
  );

  const context = recentMessages.map((m) => m.content).join("\n");

  const prompt = `Given this conversation context and partial message, suggest 3 ways to complete it. Respond with only the completion text, one per line:\n\nContext:\n${context}\n\nPartial message: "${text}"`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 150,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    const suggestions = data.choices[0].message.content
      .trim()
      .split("\n")
      .filter((s) => s.trim())
      .slice(0, 3);

    return { suggestions, partial: text };
  } catch (error) {
    return { suggestions: [] };
  }
}
export async function POST(request) {
  return handler(await request.json());
}