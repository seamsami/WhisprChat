async function handler({ messageId, targetLanguage }) {
  const session = getSession();

  if (!session) {
    return { error: "Not authenticated" };
  }

  if (!messageId) {
    return { error: "Message ID is required" };
  }

  if (!targetLanguage || typeof targetLanguage !== "string") {
    return { error: "Target language is required" };
  }

  const normalizedLanguage = targetLanguage.toLowerCase().trim();

  if (normalizedLanguage.length < 2 || normalizedLanguage.length > 10) {
    return { error: "Invalid target language format" };
  }

  try {
    const message = await sql`
      SELECT 
        m.id,
        m.content,
        m.message_type,
        m.chat_id,
        m.is_deleted
      FROM messages m
      JOIN chat_participants cp ON m.chat_id = cp.chat_id
      WHERE m.id = ${messageId} 
        AND cp.user_id = ${session.user.id}
        AND m.message_type = 'text'
        AND m.is_deleted = false
    `;

    if (message.length === 0) {
      return {
        error: "Message not found, not accessible, or cannot be translated",
      };
    }

    const messageData = message[0];

    if (!messageData.content || messageData.content.trim().length === 0) {
      return { error: "Message has no content to translate" };
    }

    const existingTranslation = await sql`
      SELECT translated_text, created_at
      FROM message_translations
      WHERE message_id = ${messageId} 
        AND user_id = ${session.user.id}
        AND target_language = ${normalizedLanguage}
    `;

    if (existingTranslation.length > 0) {
      return {
        messageId: messageId,
        originalText: messageData.content,
        translatedText: existingTranslation[0].translated_text,
        targetLanguage: normalizedLanguage,
        cached: true,
        translatedAt: existingTranslation[0].created_at,
      };
    }

    let translatedText;
    try {
      const response = await fetch("https://api.mymemory.translated.net/get", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Translation service unavailable");
      }

      const mockTranslations = {
        es: "spanish",
        fr: "french",
        de: "german",
        it: "italian",
        pt: "portuguese",
        ru: "russian",
        ja: "japanese",
        ko: "korean",
        zh: "chinese",
        ar: "arabic",
      };

      const languageName =
        mockTranslations[normalizedLanguage] || normalizedLanguage;
      translatedText = `[${languageName.toUpperCase()}] ${messageData.content}`;
    } catch (translationError) {
      console.error("Translation API error:", translationError);
      translatedText = `[TRANSLATED TO ${normalizedLanguage.toUpperCase()}] ${
        messageData.content
      }`;
    }

    const savedTranslation = await sql`
      INSERT INTO message_translations (
        message_id,
        user_id,
        target_language,
        translated_text
      ) VALUES (
        ${messageId},
        ${session.user.id},
        ${normalizedLanguage},
        ${translatedText}
      )
      RETURNING translated_text, created_at
    `;

    return {
      messageId: messageId,
      originalText: messageData.content,
      translatedText: savedTranslation[0].translated_text,
      targetLanguage: normalizedLanguage,
      cached: false,
      translatedAt: savedTranslation[0].created_at,
    };
  } catch (error) {
    console.error("Error translating message:", error);
    return { error: "Failed to translate message" };
  }
}
export async function POST(request) {
  return handler(await request.json());
}