"use client";
import React, { useState, useEffect, useRef } from "react";
import { useUser } from "../../../utilities/hooks/useUser";
import { useAuth } from "../../../utilities/hooks/useAuth";

import { useUpload } from "../../../utilities/runtime-helpers";

function MainComponent() {
  const { data: user, loading: userLoading } = useUser();
  const { signOut } = useAuth();
  const [upload, { loading: uploadLoading }] = useUpload();

  // Get chatId from URL path
  const [chatId, setChatId] = useState(null);
  const [chat, setChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Message input state
  const [messageText, setMessageText] = useState("");
  const [replyToMessage, setReplyToMessage] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Media and file sharing
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);

  // Voice recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);

  // AI Translation
  const [showTranslation, setShowTranslation] = useState({});
  const [translatedMessages, setTranslatedMessages] = useState({});

  // Message actions
  const [showMessageActions, setShowMessageActions] = useState({});

  // Refs
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const recordingIntervalRef = useRef(null);

  // Extract chatId from URL on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const pathParts = window.location.pathname.split("/");
      const id = pathParts[pathParts.length - 1];
      if (id && id !== "chat") {
        setChatId(parseInt(id));
      }
    }
  }, []);

  // Load chat data when chatId is available
  useEffect(() => {
    if (chatId && user) {
      loadChatData();
    }
  }, [chatId, user]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadChatData = async () => {
    try {
      setLoading(true);

      // Load chat details and messages
      const [messagesResponse] = await Promise.all([
        fetch("/api/get-chat-messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, limit: 50 }),
        }),
      ]);

      if (messagesResponse.ok) {
        const messagesData = await messagesResponse.json();
        setMessages(messagesData.messages.reverse() || []);
      }

      // Get chat info from user's chat list
      const chatsResponse = await fetch("/api/list-user-chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });

      if (chatsResponse.ok) {
        const chatsData = await chatsResponse.json();
        const currentChat = chatsData.find((c) => c.id === chatId);
        setChat(currentChat);
      }
    } catch (error) {
      console.error("Error loading chat data:", error);
      setError("Failed to load chat");
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const sendMessage = async (
    messageType = "text",
    content = messageText,
    mediaData = null
  ) => {
    if (!content.trim() && !mediaData) return;

    try {
      const messageData = {
        chatId,
        messageType,
        content: messageType === "text" ? content : null,
        replyToMessageId: replyToMessage?.id || null,
      };

      if (mediaData) {
        messageData.mediaUrl = mediaData.url;
        messageData.mediaType = mediaData.mimeType;
        messageData.fileName = mediaData.fileName;
        messageData.fileSize = mediaData.fileSize;

        if (messageType === "voice_note") {
          messageData.duration = mediaData.duration;
        }
      }

      const response = await fetch("/api/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messageData),
      });

      if (response.ok) {
        const newMessage = await response.json();
        setMessages((prev) => [...prev, newMessage]);
        setMessageText("");
        setReplyToMessage(null);
        setSelectedFile(null);
        setMediaPreview(null);
        setShowMediaModal(false);
      }
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const editMessage = async (messageId, newContent) => {
    try {
      const response = await fetch("/api/edit-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, newContent }),
      });

      if (response.ok) {
        const updatedMessage = await response.json();
        setMessages((prev) =>
          prev.map((msg) => (msg.id === messageId ? updatedMessage : msg))
        );
        setEditingMessage(null);
        setMessageText("");
      } else {
        const errorData = await response.json();
        alert(errorData.error || "Failed to edit message");
      }
    } catch (error) {
      console.error("Error editing message:", error);
      alert("Failed to edit message");
    }
  };

  const deleteMessage = async (messageId, deleteType = "soft") => {
    if (!confirm("Are you sure you want to delete this message?")) return;

    try {
      const response = await fetch("/api/delete-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, deleteType }),
      });

      if (response.ok) {
        const result = await response.json();
        if (deleteType === "hard") {
          setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
        } else {
          setMessages((prev) =>
            prev.map((msg) => (msg.id === messageId ? result : msg))
          );
        }
      } else {
        const errorData = await response.json();
        alert(errorData.error || "Failed to delete message");
      }
    } catch (error) {
      console.error("Error deleting message:", error);
      alert("Failed to delete message");
    }
  };

  const translateMessage = async (messageId, content) => {
    try {
      const response = await fetch("/api/translate-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, targetLanguage: "es" }), // Default to Spanish
      });

      if (response.ok) {
        const translation = await response.json();
        setTranslatedMessages((prev) => ({
          ...prev,
          [messageId]: translation.translatedText,
        }));
        setShowTranslation((prev) => ({
          ...prev,
          [messageId]: true,
        }));
      } else {
        const errorData = await response.json();
        console.error("Translation error:", errorData.error);
      }
    } catch (error) {
      console.error("Translation error:", error);
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setSelectedFile(file);

    // Create preview for images
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setMediaPreview(e.target.result);
      reader.readAsDataURL(file);
    } else {
      setMediaPreview(null);
    }

    setShowMediaModal(true);
  };

  const handleMediaSend = async () => {
    if (!selectedFile) return;

    try {
      const { url, mimeType, error } = await upload({ file: selectedFile });

      if (error) {
        console.error("Upload error:", error);
        return;
      }

      let messageType = "document";
      if (mimeType.startsWith("image/")) messageType = "image";
      else if (mimeType.startsWith("video/")) messageType = "video";
      else if (mimeType.startsWith("audio/")) messageType = "audio";

      await sendMessage(messageType, "", {
        url,
        mimeType,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
      });
    } catch (error) {
      console.error("Error uploading file:", error);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      setMediaRecorder(recorder);
      setAudioChunks([]);
      setIsRecording(true);
      setRecordingTime(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          setAudioChunks((prev) => [...prev, event.data]);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
        const audioFile = new File([audioBlob], "voice-note.wav", {
          type: "audio/wav",
        });

        try {
          const { url, mimeType, error } = await upload({ file: audioFile });

          if (!error) {
            await sendMessage("voice_note", "", {
              url,
              mimeType,
              fileName: "voice-note.wav",
              fileSize: audioFile.size,
              duration: recordingTime,
            });
          }
        } catch (error) {
          console.error("Error uploading voice note:", error);
        }

        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        setRecordingTime(0);
        setAudioChunks([]);
      };

      recorder.start();

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("Error starting recording:", error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      clearInterval(recordingIntervalRef.current);
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const MessageBubble = ({ message, isOwn }) => (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg relative group ${
          isOwn ? "bg-[#357AFF] text-white" : "bg-gray-100 text-gray-800"
        }`}
      >
        {/* Reply indicator */}
        {message.reply_to_message_id && (
          <div
            className={`text-xs mb-2 p-2 rounded border-l-2 ${
              isOwn
                ? "border-white/30 bg-white/10"
                : "border-gray-300 bg-gray-50"
            }`}
          >
            <div className="font-medium">{message.reply_sender_name}</div>
            <div className="truncate">{message.reply_content}</div>
          </div>
        )}

        {/* Message content */}
        {message.message_type === "text" && !message.is_deleted && (
          <div>
            <p className="break-words">{message.content}</p>
            {showTranslation[message.id] && translatedMessages[message.id] && (
              <div
                className={`mt-2 pt-2 border-t text-sm italic ${
                  isOwn ? "border-white/30" : "border-gray-300"
                }`}
              >
                {translatedMessages[message.id]}
              </div>
            )}
          </div>
        )}

        {message.is_deleted && (
          <p className="italic text-gray-500">{message.content}</p>
        )}

        {message.message_type === "image" && !message.is_deleted && (
          <div>
            <img
              src={message.media_url}
              alt="Shared image"
              className="max-w-full h-auto rounded mb-2"
            />
            {message.content && <p>{message.content}</p>}
          </div>
        )}

        {message.message_type === "video" && !message.is_deleted && (
          <div>
            <video
              src={message.media_url}
              controls
              className="max-w-full h-auto rounded mb-2"
            />
            {message.content && <p>{message.content}</p>}
          </div>
        )}

        {message.message_type === "audio" && !message.is_deleted && (
          <div>
            <audio src={message.media_url} controls className="mb-2" />
            {message.content && <p>{message.content}</p>}
          </div>
        )}

        {message.message_type === "voice_note" && !message.is_deleted && (
          <div className="flex items-center space-x-2">
            <i className="fas fa-microphone"></i>
            <audio src={message.media_url} controls className="flex-1" />
            {message.voice_note?.duration && (
              <span className="text-xs">
                {formatDuration(message.voice_note.duration)}
              </span>
            )}
          </div>
        )}

        {message.message_type === "document" && !message.is_deleted && (
          <div className="flex items-center space-x-2">
            <i className="fas fa-file"></i>
            <div className="flex-1">
              <a
                href={message.media_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`hover:underline ${
                  isOwn ? "text-white" : "text-blue-600"
                }`}
              >
                {message.file_name}
              </a>
              {message.file_size && (
                <div className="text-xs opacity-75">
                  {(message.file_size / 1024 / 1024).toFixed(1)} MB
                </div>
              )}
            </div>
          </div>
        )}

        {/* Message actions */}
        {!message.is_deleted && (
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setReplyToMessage(message)}
                className={`text-xs hover:underline ${
                  isOwn
                    ? "text-white/70 hover:text-white"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Reply
              </button>
              {message.message_type === "text" && (
                <button
                  onClick={() => translateMessage(message.id, message.content)}
                  className={`text-xs hover:underline ${
                    isOwn
                      ? "text-white/70 hover:text-white"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Translate
                </button>
              )}
              {isOwn && message.message_type === "text" && (
                <>
                  <button
                    onClick={() => {
                      setEditingMessage(message);
                      setMessageText(message.content);
                    }}
                    className="text-xs hover:underline text-white/70 hover:text-white"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteMessage(message.id, "soft")}
                    className="text-xs hover:underline text-white/70 hover:text-white"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
            <div
              className={`text-xs ${isOwn ? "text-white/70" : "text-gray-500"}`}
            >
              {formatTime(message.created_at)}
              {message.is_edited && <span className="ml-1">(edited)</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (userLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#357AFF] mx-auto mb-4"></div>
          <p className="text-gray-600">Loading chat...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            Please sign in
          </h1>
          <a
            href="/account/signin"
            className="inline-block bg-[#357AFF] text-white px-6 py-3 rounded-lg hover:bg-[#2E69DE] transition-colors"
          >
            Sign In
          </a>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <i className="fas fa-exclamation-triangle text-4xl text-red-500 mb-4"></i>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Error</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <a
            href="/chat"
            className="inline-block bg-[#357AFF] text-white px-6 py-3 rounded-lg hover:bg-[#2E69DE] transition-colors"
          >
            Back to Chats
          </a>
        </div>
      </div>
    );
  }

  if (!chat) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <i className="fas fa-comments text-4xl text-gray-400 mb-4"></i>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Chat not found
          </h1>
          <p className="text-gray-600 mb-4">
            This chat doesn't exist or you don't have access to it
          </p>
          <a
            href="/chat"
            className="inline-block bg-[#357AFF] text-white px-6 py-3 rounded-lg hover:bg-[#2E69DE] transition-colors"
          >
            Back to Chats
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white">
      {/* Chat Header */}
      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <a
                href="/chat"
                className="p-2 hover:bg-gray-100 rounded-lg md:hidden"
              >
                <i className="fas fa-arrow-left text-gray-600"></i>
              </a>
              <div className="relative">
                <div className="w-10 h-10 bg-gradient-to-br from-[#357AFF] to-[#2E69DE] rounded-full flex items-center justify-center text-white font-semibold">
                  {chat.profile_picture ? (
                    <img
                      src={chat.profile_picture}
                      alt={chat.name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    chat.name?.charAt(0)?.toUpperCase() || "?"
                  )}
                </div>
                {chat.is_online && (
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                )}
              </div>
              <div>
                <h1 className="font-semibold text-gray-900">{chat.name}</h1>
                <p className="text-sm text-gray-500">
                  {chat.is_online ? "Online" : "Last seen recently"}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button className="p-2 hover:bg-gray-100 rounded-lg">
                <i className="fas fa-phone text-gray-600"></i>
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg">
                <i className="fas fa-video text-gray-600"></i>
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg">
                <i className="fas fa-ellipsis-v text-gray-600"></i>
              </button>
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <i className="fas fa-comments text-4xl mb-4 opacity-50"></i>
              <p>No messages yet</p>
              <p className="text-sm mt-2">Start the conversation!</p>
            </div>
          ) : (
            <div>
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isOwn={message.sender_id === user.id}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Reply indicator */}
        {replyToMessage && (
          <div className="bg-blue-50 border-l-4 border-[#357AFF] p-3 mx-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-[#357AFF]">
                  Replying to {replyToMessage.sender_name}
                </div>
                <div className="text-sm text-gray-600 truncate">
                  {replyToMessage.content}
                </div>
              </div>
              <button
                onClick={() => setReplyToMessage(null)}
                className="p-1 hover:bg-blue-100 rounded"
              >
                <i className="fas fa-times text-gray-500"></i>
              </button>
            </div>
          </div>
        )}

        {/* Edit indicator */}
        {editingMessage && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mx-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-yellow-700">
                  Editing message
                </div>
                <div className="text-sm text-gray-600 truncate">
                  {editingMessage.content}
                </div>
              </div>
              <button
                onClick={() => {
                  setEditingMessage(null);
                  setMessageText("");
                }}
                className="p-1 hover:bg-yellow-100 rounded"
              >
                <i className="fas fa-times text-gray-500"></i>
              </button>
            </div>
          </div>
        )}

        {/* Message Input */}
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="flex items-end space-x-2">
            <div className="flex-1">
              <div className="flex items-center bg-gray-100 rounded-lg px-4 py-2">
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="p-1 hover:bg-gray-200 rounded mr-2"
                >
                  <i className="fas fa-smile text-gray-500"></i>
                </button>
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      if (editingMessage) {
                        editMessage(editingMessage.id, messageText);
                      } else {
                        sendMessage();
                      }
                    }
                  }}
                  placeholder={
                    editingMessage ? "Edit message..." : "Type a message..."
                  }
                  className="flex-1 bg-transparent outline-none"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileSelect}
                  className="hidden"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1 hover:bg-gray-200 rounded ml-2"
                >
                  <i className="fas fa-paperclip text-gray-500"></i>
                </button>
              </div>
            </div>

            {messageText.trim() ? (
              <button
                onClick={() => {
                  if (editingMessage) {
                    editMessage(editingMessage.id, messageText);
                  } else {
                    sendMessage();
                  }
                }}
                className="bg-[#357AFF] text-white p-3 rounded-lg hover:bg-[#2E69DE] transition-colors"
              >
                <i
                  className={`fas ${
                    editingMessage ? "fa-check" : "fa-paper-plane"
                  }`}
                ></i>
              </button>
            ) : (
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`p-3 rounded-lg transition-colors ${
                  isRecording
                    ? "bg-red-500 text-white hover:bg-red-600"
                    : "bg-[#357AFF] text-white hover:bg-[#2E69DE]"
                }`}
              >
                <i
                  className={`fas ${isRecording ? "fa-stop" : "fa-microphone"}`}
                ></i>
              </button>
            )}
          </div>

          {isRecording && (
            <div className="flex items-center justify-center mt-2 text-red-500">
              <i className="fas fa-circle animate-pulse mr-2"></i>
              <span>Recording... {formatDuration(recordingTime)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Media Upload Modal */}
      {showMediaModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-md mx-4">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Send File</h2>
                <button
                  onClick={() => {
                    setShowMediaModal(false);
                    setSelectedFile(null);
                    setMediaPreview(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <i className="fas fa-times text-gray-600"></i>
                </button>
              </div>
            </div>

            <div className="p-4">
              {mediaPreview && (
                <img
                  src={mediaPreview}
                  alt="Preview"
                  className="w-full h-48 object-cover rounded-lg mb-4"
                />
              )}

              {selectedFile && (
                <div className="mb-4">
                  <div className="flex items-center space-x-2 text-gray-600">
                    <i className="fas fa-file"></i>
                    <span>{selectedFile.name}</span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                  </div>
                </div>
              )}

              <div className="flex space-x-2">
                <button
                  onClick={() => {
                    setShowMediaModal(false);
                    setSelectedFile(null);
                    setMediaPreview(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMediaSend}
                  disabled={uploadLoading}
                  className="flex-1 px-4 py-2 bg-[#357AFF] text-white rounded-lg hover:bg-[#2E69DE] disabled:opacity-50"
                >
                  {uploadLoading ? "Uploading..." : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MainComponent;