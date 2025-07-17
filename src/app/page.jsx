"use client";
import React, { useState, useEffect, useRef } from "react";



import { useUpload } from "../utilities/runtime-helpers";
import { useUser } from "../utilities/hooks/useUser"; // adjust path as needed
import { useAuth } from "../utilities/hooks/useAuth"; // adjust relative path as needed



function MainComponent() {
  const { data: user, loading: userLoading } = useUser();
  const { signOut } = useAuth();
  const [upload, { loading: uploadLoading }] = useUpload();

  // Core state
  const [activeChat, setActiveChat] = useState(null);
  const [chats, setChats] = useState([]);
  const [messages, setMessages] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("chats");
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showCallModal, setShowCallModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);

  // Message input state
  const [messageText, setMessageText] = useState("");
  const [replyToMessage, setReplyToMessage] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [typing, setTyping] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [messageSearchResults, setMessageSearchResults] = useState([]);

  // User search for new chats
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);

  // Media and file sharing
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);

  // Voice recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);

  // AI features
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [showTranslation, setShowTranslation] = useState({});
  const [translatedMessages, setTranslatedMessages] = useState({});
  const [aiLoading, setAiLoading] = useState(false);

  // Message reactions
  const [messageReactions, setMessageReactions] = useState({});
  const [showReactionPicker, setShowReactionPicker] = useState({});

  // WebSocket connection
  const [ws, setWs] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  // Refs
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const recordingIntervalRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Load initial data
  useEffect(() => {
    if (user) {
      loadUserData();
      initializeWebSocket();
    }
  }, [user]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Search users when query changes
  useEffect(() => {
    if (userSearchQuery.trim().length > 0) {
      searchUsers();
    } else {
      setUserSearchResults([]);
    }
  }, [userSearchQuery]);

  // Search messages when query changes
  useEffect(() => {
    if (messageSearchQuery.trim().length > 0) {
      searchMessages();
    } else {
      setMessageSearchResults([]);
    }
  }, [messageSearchQuery]);

  const loadUserData = async () => {
    try {
      // Load user profile
      const profileResponse = await fetch("/api/get-user-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });

      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        setUserProfile(profileData);
      }

      // Load chats
      const chatsResponse = await fetch("/api/list-user-chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });

      if (chatsResponse.ok) {
        const chatsData = await chatsResponse.json();
        setChats(chatsData || []);
      }
    } catch (error) {
      console.error("Error loading user data:", error);
      setError("Failed to load user data");
    } finally {
      setLoading(false);
    }
  };

  const initializeWebSocket = () => {
    try {
      const wsUrl = process.env.NEXT_PUBLIC_WEBSOCKET_URL || "ws://localhost:8080";
      const websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        setConnectionStatus("connected");
        websocket.send(
          JSON.stringify({
            type: "authenticate",
            userId: user.id,
          })
        );
      };

      websocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      };

      websocket.onclose = () => {
        setConnectionStatus("disconnected");
        // Attempt to reconnect after 3 seconds
        setTimeout(() => {
          if (user) initializeWebSocket();
        }, 3000);
      };

      websocket.onerror = (error) => {
        console.error("WebSocket error:", error);
        setConnectionStatus("error");
      };

      setWs(websocket);
    } catch (error) {
      console.error("Failed to initialize WebSocket:", error);
      setConnectionStatus("error");
    }
  };

  const handleWebSocketMessage = (data) => {
    switch (data.type) {
      case "new_message":
        if (activeChat && data.message.chat_id === activeChat.id) {
          setMessages((prev) => [...prev, data.message]);
        }
        // Update chat list with new message
        setChats((prev) =>
          prev.map((chat) =>
            chat.id === data.message.chat_id
              ? {
                  ...chat,
                  last_message: data.message.content,
                  last_message_time: data.message.created_at,
                }
              : chat
          )
        );
        break;
      case "message_edited":
        setMessages((prev) =>
          prev.map((msg) => (msg.id === data.message.id ? data.message : msg))
        );
        break;
      case "message_deleted":
        if (data.deleteType === "hard") {
          setMessages((prev) =>
            prev.filter((msg) => msg.id !== data.messageId)
          );
        } else {
          setMessages((prev) =>
            prev.map((msg) => (msg.id === data.messageId ? data.message : msg))
          );
        }
        break;
      case "user_typing":
        if (
          activeChat &&
          data.chatId === activeChat.id &&
          data.userId !== user.id
        ) {
          setTyping(true);
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setTyping(false), 3000);
        }
        break;
      case "user_online":
        setOnlineUsers((prev) => new Set([...prev, data.userId]));
        break;
      case "user_offline":
        setOnlineUsers((prev) => {
          const newSet = new Set(prev);
          newSet.delete(data.userId);
          return newSet;
        });
        break;
      case "reaction_added":
      case "reaction_removed":
        setMessageReactions((prev) => ({
          ...prev,
          [data.messageId]: data.reactions,
        }));
        break;
    }
  };

  const loadChatMessages = async (chatId) => {
    try {
      const response = await fetch("/api/get-chat-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, limit: 50 }),
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages.reverse() || []);

        // Load reactions for messages
        const messageIds = data.messages.map((m) => m.id);
        if (messageIds.length > 0) {
          loadMessageReactions(messageIds);
        }
      }
    } catch (error) {
      console.error("Error loading messages:", error);
    }
  };

  const loadMessageReactions = async (messageIds) => {
    try {
      const reactions = {};
      for (const messageId of messageIds) {
        // This would need to be implemented in the backend
        reactions[messageId] = [];
      }
      setMessageReactions(reactions);
    } catch (error) {
      console.error("Error loading reactions:", error);
    }
  };

  const selectChat = (chat) => {
    setActiveChat(chat);
    loadChatMessages(chat.id);
    setShowSearch(false);
    setMessageSearchQuery("");
    setMessageSearchResults([]);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const sendMessage = async (
    messageType = "text",
    content = messageText,
    mediaData = null
  ) => {
    if (!activeChat || (!content.trim() && !mediaData)) return;

    try {
      const messageData = {
        chatId: activeChat.id,
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

        // Send via WebSocket for real-time updates
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "send_message",
              message: newMessage,
            })
          );
        }
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
      }
    } catch (error) {
      console.error("Error editing message:", error);
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
      }
    } catch (error) {
      console.error("Error deleting message:", error);
    }
  };

  const addReaction = async (messageId, emoji) => {
    try {
      const response = await fetch("/api/add-message-reaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, emoji }),
      });

      if (response.ok) {
        const result = await response.json();
        setMessageReactions((prev) => ({
          ...prev,
          [messageId]: result.reactions,
        }));
      }
    } catch (error) {
      console.error("Error adding reaction:", error);
    }
  };

  const searchUsers = async () => {
    setUserSearchLoading(true);
    try {
      const response = await fetch("/api/search-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userSearchQuery, limit: 10 }),
      });

      if (response.ok) {
        const users = await response.json();
        setUserSearchResults(users || []);
      }
    } catch (error) {
      console.error("Error searching users:", error);
    } finally {
      setUserSearchLoading(false);
    }
  };

  const searchMessages = async () => {
    if (!activeChat) return;

    setSearchLoading(true);
    try {
      const response = await fetch("/api/search-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: activeChat.id,
          query: messageSearchQuery,
          limit: 20,
        }),
      });

      if (response.ok) {
        const results = await response.json();
        setMessageSearchResults(results.messages || []);
      }
    } catch (error) {
      console.error("Error searching messages:", error);
    } finally {
      setSearchLoading(false);
    }
  };

  const startDirectChat = async (otherUserId) => {
    try {
      const response = await fetch("/api/create-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatType: "direct",
          participantUserIds: [otherUserId],
        }),
      });

      if (response.ok) {
        const newChat = await response.json();
        setChats((prev) => [newChat, ...prev]);
        setActiveChat(newChat);
        setShowNewChatModal(false);
        setUserSearchQuery("");
        setUserSearchResults([]);
        loadChatMessages(newChat.id);
      }
    } catch (error) {
      console.error("Error creating chat:", error);
    }
  };

  const getAISuggestions = async () => {
    if (!activeChat) return;

    setAiLoading(true);
    try {
      const response = await fetch("/api/ai-smart-features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "smart_reply",
          chatId: activeChat.id,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setAiSuggestions(result.replies || []);
      }
    } catch (error) {
      console.error("Error getting AI suggestions:", error);
    } finally {
      setAiLoading(false);
    }
  };

  const translateMessage = async (messageId, targetLanguage = "es") => {
    try {
      const response = await fetch("/api/ai-smart-features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "translate",
          messageId,
          targetLanguage,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setTranslatedMessages((prev) => ({
          ...prev,
          [messageId]: result.translatedText,
        }));
        setShowTranslation((prev) => ({
          ...prev,
          [messageId]: true,
        }));
      }
    } catch (error) {
      console.error("Error translating message:", error);
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setSelectedFile(file);

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

  const handleSignOut = async () => {
    if (ws) {
      ws.close();
    }
    await signOut({
      callbackUrl: "/account/signin",
      redirect: true,
    });
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

  const formatLastSeen = (lastSeen) => {
    if (!lastSeen) return "Never";
    const date = new Date(lastSeen);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const MessageBubble = ({ message, isOwn }) => (
    <div
      className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-4 group`}
    >
      <div
        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg relative ${
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
              className="max-w-full h-auto rounded mb-2 cursor-pointer"
              onClick={() => window.open(message.media_url, "_blank")}
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

        {/* Message reactions */}
        {messageReactions[message.id] &&
          messageReactions[message.id].length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {messageReactions[message.id].map((reaction, index) => (
                <button
                  key={index}
                  onClick={() => addReaction(message.id, reaction.emoji)}
                  className="text-xs bg-white/20 rounded-full px-2 py-1 hover:bg-white/30"
                >
                  {reaction.emoji} {reaction.count}
                </button>
              ))}
            </div>
          )}

        {/* Message actions */}
        {!message.is_deleted && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -right-2 top-0 flex items-center space-x-1">
            <button
              onClick={() =>
                setShowReactionPicker((prev) => ({
                  ...prev,
                  [message.id]: !prev[message.id],
                }))
              }
              className="p-1 bg-white rounded-full shadow-md hover:bg-gray-50"
            >
              <i className="fas fa-smile text-gray-600 text-xs"></i>
            </button>
            <button
              onClick={() => setReplyToMessage(message)}
              className="p-1 bg-white rounded-full shadow-md hover:bg-gray-50"
            >
              <i className="fas fa-reply text-gray-600 text-xs"></i>
            </button>
            {message.message_type === "text" && (
              <button
                onClick={() => translateMessage(message.id)}
                className="p-1 bg-white rounded-full shadow-md hover:bg-gray-50"
              >
                <i className="fas fa-language text-gray-600 text-xs"></i>
              </button>
            )}
            {isOwn && (
              <button
                onClick={() => deleteMessage(message.id, "soft")}
                className="p-1 bg-white rounded-full shadow-md hover:bg-gray-50"
              >
                <i className="fas fa-trash text-red-600 text-xs"></i>
              </button>
            )}
          </div>
        )}

        {/* Reaction picker */}
        {showReactionPicker[message.id] && (
          <div className="absolute bottom-full right-0 mb-2 bg-white rounded-lg shadow-lg p-2 flex space-x-1 z-10">
            {["👍", "❤️", "😂", "😮", "😢", "😡"].map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  addReaction(message.id, emoji);
                  setShowReactionPicker((prev) => ({
                    ...prev,
                    [message.id]: false,
                  }));
                }}
                className="text-lg hover:bg-gray-100 rounded p-1"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <div
          className={`text-xs mt-1 ${
            isOwn ? "text-white/70" : "text-gray-500"
          }`}
        >
          {formatTime(message.created_at)}
          {message.is_edited && <span className="ml-1">(edited)</span>}
        </div>
      </div>
    </div>
  );

  const ChatItem = ({ chat }) => (
    <div
      onClick={() => selectChat(chat)}
      className={`flex items-center p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-100 ${
        activeChat?.id === chat.id
          ? "bg-blue-50 border-l-4 border-l-[#357AFF]"
          : ""
      }`}
    >
      <div className="relative">
        <div className="w-12 h-12 bg-gradient-to-br from-[#357AFF] to-[#2E69DE] rounded-full flex items-center justify-center text-white font-semibold">
          {chat.profile_picture ? (
            <img
              src={chat.profile_picture}
              alt={chat.name}
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            chat.name?.charAt(0)?.toUpperCase() || "?"
          )}
        </div>
        {chat.is_online && (
          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
        )}
      </div>
      <div className="ml-3 flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 truncate">
            {chat.name || "Unknown"}
          </h3>
          <span className="text-xs text-gray-500">
            {formatLastSeen(chat.last_message_time)}
          </span>
        </div>
        <p className="text-sm text-gray-600 truncate">
          {chat.last_message || "No messages yet"}
        </p>
      </div>
      {chat.unread_count > 0 && (
        <div className="ml-2 bg-[#357AFF] text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
          {chat.unread_count}
        </div>
      )}
    </div>
  );

  const UserSearchResult = ({ user }) => (
    <div
      className="flex items-center p-3 hover:bg-gray-50 cursor-pointer"
      onClick={() => startDirectChat(user.id)}
    >
      <div className="relative">
        <div className="w-10 h-10 bg-gradient-to-br from-[#357AFF] to-[#2E69DE] rounded-full flex items-center justify-center text-white font-semibold">
          {user.profile_picture ? (
            <img
              src={user.profile_picture}
              alt={user.display_name}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            user.display_name?.charAt(0)?.toUpperCase() || "?"
          )}
        </div>
        {onlineUsers.has(user.id) && (
          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
        )}
      </div>
      <div className="ml-3 flex-1 min-w-0">
        <h4 className="font-medium text-gray-900 truncate">
          {user.display_name}
        </h4>
        <p className="text-sm text-gray-500 truncate">
          {user.username ? `@${user.username}` : user.email}
        </p>
        {user.bio && (
          <p className="text-xs text-gray-400 truncate">{user.bio}</p>
        )}
      </div>
    </div>
  );

  if (userLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#357AFF] mx-auto mb-4"></div>
          <p className="text-gray-600">Loading WhisprChat...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            Welcome to WhisprChat
          </h1>
          <p className="text-gray-600 mb-6">Please sign in to continue</p>
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

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? "w-80" : "w-16"
        } bg-white border-r border-gray-200 flex flex-col transition-all duration-300`}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <i className="fas fa-bars text-gray-600"></i>
              </button>
              {sidebarOpen && (
                <h1 className="text-xl font-bold text-gray-800">WhisprChat</h1>
              )}
            </div>
            {sidebarOpen && (
              <div className="flex items-center space-x-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    connectionStatus === "connected"
                      ? "bg-green-500"
                      : connectionStatus === "error"
                      ? "bg-red-500"
                      : "bg-yellow-500"
                  }`}
                  title={`Connection: ${connectionStatus}`}
                ></div>
                <button
                  onClick={() => setShowSearch(!showSearch)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <i className="fas fa-search text-gray-600"></i>
                </button>
                <a
                  href="/profile"
                  className="p-2 hover:bg-gray-100 rounded-lg"
                  title="Profile Settings"
                >
                  <i className="fas fa-cog text-gray-600"></i>
                </a>
                <button
                  onClick={handleSignOut}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                  title="Sign Out"
                >
                  <i className="fas fa-sign-out-alt text-gray-600"></i>
                </button>
              </div>
            )}
          </div>

          {sidebarOpen && (
            <>
              {/* User Profile */}
              <a
                href="/profile"
                className="flex items-center space-x-3 hover:bg-gray-50 rounded-lg p-2 -m-2 transition-colors"
              >
                <div className="w-10 h-10 bg-gradient-to-br from-[#357AFF] to-[#2E69DE] rounded-full flex items-center justify-center text-white font-semibold">
                  {userProfile?.profile_picture ? (
                    <img
                      src={userProfile.profile_picture}
                      alt="Profile"
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    (userProfile?.display_name || user.name || user.email)
                      ?.charAt(0)
                      ?.toUpperCase() || "?"
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {userProfile?.display_name || user.name || "User"}
                  </p>
                  <p className="text-sm text-gray-500 truncate">
                    {userProfile?.status || "Available"}
                  </p>
                </div>
              </a>

              {/* Search Bar */}
              {showSearch && (
                <div className="mt-4">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search chats and messages..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357AFF] focus:border-transparent"
                    />
                    <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {sidebarOpen && (
          <>
            {/* Navigation Tabs */}
            <div className="flex border-b border-gray-200">
              {[
                { id: "chats", label: "Chats", icon: "fas fa-comments" },
                { id: "groups", label: "Groups", icon: "fas fa-users" },
                {
                  id: "channels",
                  label: "Channels",
                  icon: "fas fa-broadcast-tower",
                },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 py-3 px-2 text-xs font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? "border-[#357AFF] text-[#357AFF]"
                      : "border-transparent text-gray-600 hover:text-gray-800"
                  }`}
                >
                  <i className={`${tab.icon} mr-1`}></i>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Chat List */}
            <div className="flex-1 overflow-y-auto">
              {chats.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <i className="fas fa-comments text-4xl mb-4 opacity-50"></i>
                  <p className="text-center">No chats yet</p>
                  <p className="text-sm text-center mt-2">
                    Start a conversation to get started
                  </p>
                </div>
              ) : (
                chats.map((chat) => <ChatItem key={chat.id} chat={chat} />)
              )}
            </div>

            {/* Action Buttons */}
            <div className="p-4 border-t border-gray-200 space-y-2">
              <button
                onClick={() => setShowNewChatModal(true)}
                className="w-full bg-[#357AFF] text-white py-2 px-4 rounded-lg hover:bg-[#2E69DE] transition-colors flex items-center justify-center text-sm"
              >
                <i className="fas fa-plus mr-2"></i>
                New Chat
              </button>
              <div className="flex space-x-2">
                <button
                  onClick={() => setShowGroupModal(true)}
                  className="flex-1 bg-gray-100 text-gray-700 py-2 px-3 rounded-lg hover:bg-gray-200 transition-colors text-xs"
                >
                  <i className="fas fa-users mr-1"></i>
                  Group
                </button>
                <button
                  onClick={() => setShowCallModal(true)}
                  className="flex-1 bg-gray-100 text-gray-700 py-2 px-3 rounded-lg hover:bg-gray-200 transition-colors text-xs"
                >
                  <i className="fas fa-phone mr-1"></i>
                  Call
                </button>
                <button
                  onClick={() => {
                    setShowAIModal(true);
                    getAISuggestions();
                  }}
                  className="flex-1 bg-gray-100 text-gray-700 py-2 px-3 rounded-lg hover:bg-gray-200 transition-colors text-xs"
                >
                  <i className="fas fa-robot mr-1"></i>
                  AI
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {activeChat ? (
          <>
            {/* Chat Header */}
            <div className="bg-white border-b border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <div className="w-10 h-10 bg-gradient-to-br from-[#357AFF] to-[#2E69DE] rounded-full flex items-center justify-center text-white font-semibold">
                      {activeChat.profile_picture ? (
                        <img
                          src={activeChat.profile_picture}
                          alt={activeChat.name}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        activeChat.name?.charAt(0)?.toUpperCase() || "?"
                      )}
                    </div>
                    {activeChat.is_online && (
                      <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                    )}
                  </div>
                  <div>
                    <h1 className="font-semibold text-gray-900">
                      {activeChat.name}
                    </h1>
                    <p className="text-sm text-gray-500">
                      {typing
                        ? "Typing..."
                        : activeChat.is_online
                        ? "Online"
                        : "Last seen recently"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setShowSearch(!showSearch)}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <i className="fas fa-search text-gray-600"></i>
                  </button>
                  <button
                    onClick={() => setShowCallModal(true)}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <i className="fas fa-phone text-gray-600"></i>
                  </button>
                  <button
                    onClick={() => setShowCallModal(true)}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <i className="fas fa-video text-gray-600"></i>
                  </button>
                  <button className="p-2 hover:bg-gray-100 rounded-lg">
                    <i className="fas fa-ellipsis-v text-gray-600"></i>
                  </button>
                </div>
              </div>

              {/* Message Search */}
              {showSearch && (
                <div className="mt-4">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search messages in this chat..."
                      value={messageSearchQuery}
                      onChange={(e) => setMessageSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357AFF] focus:border-transparent"
                    />
                    <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                  </div>
                  {messageSearchResults.length > 0 && (
                    <div className="mt-2 max-h-32 overflow-y-auto bg-white border rounded-lg">
                      {messageSearchResults.map((message) => (
                        <div
                          key={message.id}
                          className="p-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                        >
                          <div className="text-sm font-medium">
                            {message.sender_name}
                          </div>
                          <div className="text-xs text-gray-600 truncate">
                            {message.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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

            {/* AI Suggestions */}
            {aiSuggestions.length > 0 && (
              <div className="bg-purple-50 border-l-4 border-purple-400 p-3 mx-4">
                <div className="text-sm font-medium text-purple-700 mb-2">
                  <i className="fas fa-robot mr-2"></i>
                  AI Suggestions
                </div>
                <div className="flex flex-wrap gap-2">
                  {aiSuggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setMessageText(suggestion);
                        setAiSuggestions([]);
                      }}
                      className="text-sm bg-purple-100 text-purple-700 px-3 py-1 rounded-full hover:bg-purple-200 transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
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
                      onChange={(e) => {
                        setMessageText(e.target.value);
                        // Send typing indicator via WebSocket
                        if (ws && ws.readyState === WebSocket.OPEN) {
                          ws.send(
                            JSON.stringify({
                              type: "typing",
                              chatId: activeChat.id,
                            })
                          );
                        }
                      }}
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
                      className={`fas ${
                        isRecording ? "fa-stop" : "fa-microphone"
                      }`}
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
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="w-24 h-24 bg-gradient-to-br from-[#357AFF] to-[#2E69DE] rounded-full flex items-center justify-center text-white text-3xl mb-6 mx-auto">
                <i className="fas fa-comments"></i>
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                Welcome to WhisprChat
              </h2>
              <p className="text-gray-600 mb-6">
                Select a chat to start messaging
              </p>
              <div className="space-y-2 text-sm text-gray-500">
                <p>
                  <i className="fas fa-shield-alt mr-2 text-green-500"></i>
                  End-to-end encrypted
                </p>
                <p>
                  <i className="fas fa-eye-slash mr-2 text-blue-500"></i>
                  Privacy-first messaging
                </p>
                <p>
                  <i className="fas fa-language mr-2 text-purple-500"></i>AI
                  auto-translation
                </p>
                <p>
                  <i className="fas fa-robot mr-2 text-orange-500"></i>Smart AI
                  assistance
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      {showNewChatModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">
                  New Chat
                </h2>
                <button
                  onClick={() => {
                    setShowNewChatModal(false);
                    setUserSearchQuery("");
                    setUserSearchResults([]);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <i className="fas fa-times text-gray-600"></i>
                </button>
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search users by email, username, or name..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357AFF] focus:border-transparent"
                />
                <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {userSearchLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#357AFF]"></div>
                </div>
              ) : userSearchResults.length > 0 ? (
                <div>
                  {userSearchResults.map((user) => (
                    <UserSearchResult key={user.id} user={user} />
                  ))}
                </div>
              ) : userSearchQuery.trim().length > 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                  <i className="fas fa-user-slash text-2xl mb-2 opacity-50"></i>
                  <p>No users found</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                  <i className="fas fa-search text-2xl mb-2 opacity-50"></i>
                  <p>Search for users to start chatting</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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

      {/* AI Assistant Modal */}
      {showAIModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-md mx-4">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  <i className="fas fa-robot mr-2 text-purple-600"></i>
                  AI Assistant
                </h2>
                <button
                  onClick={() => setShowAIModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <i className="fas fa-times text-gray-600"></i>
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              <button
                onClick={() => {
                  getAISuggestions();
                  setShowAIModal(false);
                }}
                disabled={aiLoading}
                className="w-full p-3 text-left border border-gray-200 rounded-lg hover:bg-gray-"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MainComponent;