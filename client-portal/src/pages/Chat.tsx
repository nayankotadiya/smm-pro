import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Send,
  User,
  Sparkles,
  MessageSquare,
  ShieldCheck,
  CheckCheck,
  RefreshCw,
  Paperclip,
  Image as ImageIcon,
  Video as VideoIcon,
  Mic,
  MicOff,
  FileText,
  FileArchive,
  Download,
  X,
  Plus,
  Play,
  Pause,
  Maximize2,
  Trash2,
  FileCheck,
  FileSpreadsheet
} from 'lucide-react';
import { api, API_URL } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Card, Button, Spinner } from '@/components/Ui';
import clsx from 'clsx';

interface ChatAttachment {
  _id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  category: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'RAW';
  url: string;
  streamUrl?: string;
  downloadUrl: string;
}

interface ChatMessage {
  _id: string;
  message?: string;
  kind?: string;
  senderType: 'AGENCY' | 'CLIENT';
  senderName: string;
  senderRole?: string;
  isMe: boolean;
  isClient: boolean;
  createdAt: string;
  attachments?: ChatAttachment[];
}

interface TeamMember {
  name: string;
  role: string;
  email?: string;
}

interface PendingUpload {
  id: string;
  file: File;
  previewUrl?: string;
  type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';
  mediaId?: string;
  uploading: boolean;
  error?: string;
}

export function ChatPage() {
  const { user, brand, token } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [roomName, setRoomName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [previewImageModal, setPreviewImageModal] = useState<string | null>(null);

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<any>(null);

  // File input refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const loadChat = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) {
        const infoRes = await api.get('/chat');
        setTeam(infoRes.data.team || []);
        setRoomName(infoRes.data.roomName || '');
      }
      const msgsRes = await api.get('/chat/messages');
      setMessages((prev) => {
        if (JSON.stringify(prev) !== JSON.stringify(msgsRes.data)) {
          setTimeout(() => scrollToBottom(true), 120);
          return msgsRes.data;
        }
        return prev;
      });
    } catch (err) {
      console.error('[load chat]', err);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [scrollToBottom]);

  useEffect(() => {
    loadChat(true);
    const interval = setInterval(() => {
      loadChat(false);
    }, 4000);
    return () => clearInterval(interval);
  }, [loadChat]);

  // Upload a single file to server
  const uploadFile = async (file: File, type: PendingUpload['type']) => {
    const uploadId = `upl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const previewUrl = type === 'IMAGE' ? URL.createObjectURL(file) : undefined;

    const newPending: PendingUpload = {
      id: uploadId,
      file,
      previewUrl,
      type,
      uploading: true,
    };

    setPendingUploads((prev) => [...prev, newPending]);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await api.post('/chat/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setPendingUploads((prev) =>
        prev.map((item) =>
          item.id === uploadId
            ? { ...item, mediaId: res.data._id, uploading: false }
            : item
        )
      );
    } catch (err: any) {
      console.error('[uploadFile failed]', err);
      setPendingUploads((prev) =>
        prev.map((item) =>
          item.id === uploadId
            ? { ...item, uploading: false, error: err.response?.data?.message || 'Upload failed' }
            : item
        )
      );
    }
  };

  const handleFilesSelected = (files: FileList | null, type?: PendingUpload['type']) => {
    if (!files || files.length === 0) return;
    setShowAttachMenu(false);

    Array.from(files).forEach((file) => {
      let inferredType: PendingUpload['type'] = type || 'DOCUMENT';
      if (!type) {
        if (file.type.startsWith('image/')) inferredType = 'IMAGE';
        else if (file.type.startsWith('video/')) inferredType = 'VIDEO';
        else if (file.type.startsWith('audio/')) inferredType = 'AUDIO';
        else inferredType = 'DOCUMENT';
      }
      uploadFile(file, inferredType);
    });
  };

  const removePendingUpload = (id: string) => {
    setPendingUploads((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  // Voice note recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], `voice-note-${Date.now()}.webm`, { type: 'audio/webm' });
        uploadFile(audioFile, 'AUDIO');
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordTimerRef.current = setInterval(() => {
        setRecordingSeconds((sec) => sec + 1);
      }, 1000);
    } catch (err) {
      console.warn('[Microphone access error]', err);
      alert('Microphone access is required to record voice notes. Please grant permission or attach an audio file.');
    }
  };

  const stopRecording = (save = true) => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    if (mediaRecorderRef.current && isRecording) {
      if (!save) {
        audioChunksRef.current = [];
        mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      }
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const content = text.trim();
    const hasUploading = pendingUploads.some((p) => p.uploading);
    if (hasUploading) return;

    const attachmentIds = pendingUploads
      .map((p) => p.mediaId)
      .filter((id): id is string => !!id);

    if (!content && attachmentIds.length === 0) return;
    if (sending) return;

    setSending(true);
    setText('');
    const currentPending = [...pendingUploads];
    setPendingUploads([]);

    // Optimistic message
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      _id: tempId,
      message: content,
      senderType: 'CLIENT',
      senderName: user?.name || 'You',
      senderRole: 'Client',
      isMe: true,
      isClient: true,
      createdAt: new Date().toISOString(),
      attachments: currentPending.map((p) => ({
        _id: p.mediaId || p.id,
        fileName: p.file.name,
        originalName: p.file.name,
        mimeType: p.file.type,
        size: p.file.size,
        category: p.type === 'VIDEO' ? 'RAW' : (p.type as any),
        url: p.previewUrl || '',
        downloadUrl: '',
      })),
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => scrollToBottom(true), 50);

    try {
      const res = await api.post('/chat/messages', {
        message: content,
        attachments: attachmentIds,
      });
      setMessages((prev) => prev.map((m) => (m._id === tempId ? res.data : m)));
    } catch (err) {
      console.error('[send message failed]', err);
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m._id !== tempId));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const sendQuickPrompt = (prompt: string) => {
    setText(prompt);
  };

  // Helper to build authenticated media URLs for <img>, <video>, <audio>, <a>
  const getMediaUrl = (url?: string) => {
    if (!url) return '';
    const full = url.startsWith('http') ? url : `${API_URL}${url}`;
    const separator = full.includes('?') ? '&' : '?';
    return `${full}${separator}token=${encodeURIComponent(token || '')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex flex-col flex-1 h-[calc(100dvh-7.5rem)] md:h-[calc(100vh-9.5rem)] max-h-[880px] rounded-2xl border border-line bg-surface/95 shadow-card overflow-hidden">
      {/* Hidden file inputs for attachment categories */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files)}
      />
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files, 'IMAGE')}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files, 'VIDEO')}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files, 'AUDIO')}
      />
      <input
        ref={docInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.csv"
        multiple
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files, 'DOCUMENT')}
      />

      {/* Chat Header */}
      <div className="px-3.5 sm:px-4 py-3 border-b border-line bg-surface-2/70 backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-xs">
            <MessageSquare size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="text-xs sm:text-sm font-bold text-ink truncate">
                {roomName || `${brand?.businessName || brand?.name || 'Workspace'} Team`}
              </h1>
              <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 sm:px-2 py-0.5 rounded-full border border-emerald-500/20 shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            </div>
            <p className="text-[11px] text-ink-3 truncate">
              Direct connection with {brand?.businessName || brand?.name || 'Bulletproof'} creative leads
            </p>
          </div>
        </div>

        {/* Security badge & refresh */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-ink-3">
            <ShieldCheck size={14} className="text-emerald-500" /> 256-Bit SSL
          </span>
          <button
            onClick={() => loadChat(false)}
            title="Refresh messages"
            className="p-1.5 sm:p-2 rounded-xl text-ink-3 hover:text-ink hover:bg-surface border border-line/60 transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Assigned Team Leads Bar (If available) */}
      {team.length > 0 && (
        <div className="px-3 sm:px-4 py-1.5 border-b border-line/60 bg-surface/50 flex items-center gap-2 overflow-x-auto text-xs shrink-0 no-scrollbar">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-3 shrink-0">
            Team:
          </span>
          {team.map((t, idx) => (
            <div
              key={idx}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-surface-2 border border-line text-[11px] text-ink font-semibold shrink-0 shadow-xs"
            >
              <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary-soft text-[8px] text-primary font-bold">
                {t.name.charAt(0)}
              </div>
              <span className="truncate max-w-[100px]">{t.name}</span>
              <span className="text-[9px] font-normal text-ink-3 uppercase">({t.role})</span>
            </div>
          ))}
        </div>
      )}

      {/* Messages Feed */}
      <div
        ref={chatScrollContainerRef}
        className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-3.5 bg-canvas/30 min-h-0"
      >
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner size={28} />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary mb-3 shadow-xs">
              <Sparkles size={22} />
            </div>
            <h2 className="text-sm sm:text-base font-bold text-ink">Welcome to your Creative Workspace</h2>
            <p className="text-xs text-ink-3 max-w-sm mt-1 mb-5">
              Chat in real-time, send photos, videos, audio notes, and project documents directly to your agency team.
            </p>
            <div className="flex flex-wrap justify-center gap-2 max-w-md">
              <button
                onClick={() => sendQuickPrompt('Hi team, what is the status of our upcoming Reel?')}
                className="px-2.5 py-1.5 rounded-xl bg-surface border border-line text-xs text-ink-2 hover:text-ink hover:border-primary/40 transition-colors shadow-xs"
              >
                📅 Upcoming Reel status?
              </button>
              <button
                onClick={() => sendQuickPrompt('Can we schedule our next shoot for next Tuesday?')}
                className="px-2.5 py-1.5 rounded-xl bg-surface border border-line text-xs text-ink-2 hover:text-ink hover:border-primary/40 transition-colors shadow-xs"
              >
                🎬 Next shoot date?
              </button>
              <button
                onClick={() => sendQuickPrompt('I have an idea for our festival promotion campaign.')}
                className="px-2.5 py-1.5 rounded-xl bg-surface border border-line text-xs text-ink-2 hover:text-ink hover:border-primary/40 transition-colors shadow-xs"
              >
                ✨ Campaign idea
              </button>
            </div>
          </div>
        ) : (
          messages.map((m) => {
            const isMe = m.isMe;

            return (
              <div
                key={m._id}
                className={clsx('flex flex-col', isMe ? 'items-end' : 'items-start')}
              >
                {/* Sender label */}
                <span className="text-[10px] font-semibold text-ink-3 mb-1 px-1">
                  {isMe ? 'You' : `${m.senderName} • ${m.senderRole || 'Agency'}`}
                </span>

                {/* Bubble Container */}
                <div
                  className={clsx(
                    'max-w-[88%] sm:max-w-[75%] rounded-2xl p-3 shadow-xs text-sm leading-relaxed space-y-2',
                    isMe
                      ? 'bg-primary text-white rounded-br-xs'
                      : 'bg-surface border border-line text-ink rounded-bl-xs'
                  )}
                >
                  {/* Render Attachments (if any) */}
                  {m.attachments && m.attachments.length > 0 && (
                    <div className="space-y-2">
                      {m.attachments.map((att) => {
                        const streamUrl = getMediaUrl(att.streamUrl || att.url);
                        const downloadUrl = getMediaUrl(att.downloadUrl);
                        const isImage = att.category === 'IMAGE' || att.mimeType?.startsWith('image/');
                        const isVideo = att.category === 'VIDEO' || att.category === 'RAW' || att.mimeType?.startsWith('video/');
                        const isAudio = att.category === 'AUDIO' || att.mimeType?.startsWith('audio/');

                        if (isImage) {
                          return (
                            <div key={att._id} className="relative group rounded-xl overflow-hidden border border-black/10 bg-black/5">
                              <img
                                src={streamUrl}
                                alt={att.originalName}
                                className="max-h-60 w-auto max-w-full rounded-xl object-contain cursor-pointer hover:opacity-95 transition-opacity"
                                onClick={() => setPreviewImageModal(streamUrl)}
                              />
                              <a
                                href={downloadUrl}
                                download={att.originalName}
                                title="Download image"
                                className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors opacity-0 group-hover:opacity-100"
                              >
                                <Download size={14} />
                              </a>
                            </div>
                          );
                        }

                        if (isVideo) {
                          return (
                            <div key={att._id} className="rounded-xl overflow-hidden border border-black/10 bg-black/80 max-w-full">
                              <video
                                src={streamUrl}
                                controls
                                preload="metadata"
                                playsInline
                                className="max-h-64 w-full rounded-xl"
                              />
                              <div className="p-1.5 flex items-center justify-between text-[11px] bg-black/90 text-white/80 px-2.5">
                                <span className="truncate max-w-[180px] font-mono text-[10px]">{att.originalName}</span>
                                <a
                                  href={downloadUrl}
                                  download={att.originalName}
                                  className="inline-flex items-center gap-1 hover:text-white text-[10px]"
                                >
                                  <Download size={12} /> {formatFileSize(att.size)}
                                </a>
                              </div>
                            </div>
                          );
                        }

                        if (isAudio) {
                          return (
                            <div
                              key={att._id}
                              className={clsx(
                                'rounded-xl p-2.5 flex flex-col gap-1.5 border',
                                isMe ? 'bg-white/10 border-white/20' : 'bg-surface-2 border-line'
                              )}
                            >
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="inline-flex items-center gap-1.5 font-semibold">
                                  <Mic size={14} className={isMe ? 'text-white' : 'text-primary'} />
                                  <span>Voice / Audio Note</span>
                                </span>
                                <a
                                  href={downloadUrl}
                                  download={att.originalName}
                                  className="p-1 hover:opacity-80 transition-opacity"
                                  title="Download audio"
                                >
                                  <Download size={13} />
                                </a>
                              </div>
                              <audio
                                src={streamUrl}
                                controls
                                preload="metadata"
                                className="w-full h-8"
                              />
                            </div>
                          );
                        }

                        // Default: Document / Other Files
                        return (
                          <div
                            key={att._id}
                            className={clsx(
                              'flex items-center justify-between gap-3 p-2.5 rounded-xl border transition-all',
                              isMe
                                ? 'bg-white/15 border-white/20 text-white'
                                : 'bg-surface-2 border-line text-ink'
                            )}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={clsx(
                                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-xs',
                                  isMe ? 'bg-white/20 text-white' : 'bg-primary-soft text-primary'
                                )}
                              >
                                {att.originalName?.endsWith('.pdf') ? (
                                  <FileText size={18} />
                                ) : att.originalName?.match(/\.(xlsx?|csv)$/i) ? (
                                  <FileSpreadsheet size={18} />
                                ) : (
                                  <FileArchive size={18} />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold truncate leading-tight">
                                  {att.originalName}
                                </p>
                                <span className={clsx('text-[10px]', isMe ? 'text-white/75' : 'text-ink-3')}>
                                  {formatFileSize(att.size)}
                                </span>
                              </div>
                            </div>

                            <a
                              href={downloadUrl}
                              download={att.originalName}
                              className={clsx(
                                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors',
                                isMe
                                  ? 'border-white/30 hover:bg-white/20 text-white'
                                  : 'border-line hover:bg-surface text-ink'
                              )}
                              title="Download file"
                            >
                              <Download size={14} />
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Text Message Body */}
                  {m.message && (
                    <p className="whitespace-pre-wrap break-words">{m.message}</p>
                  )}

                  {/* Timestamp & checkmarks */}
                  <div
                    className={clsx(
                      'flex items-center justify-end gap-1 text-[10px] pt-0.5',
                      isMe ? 'text-white/75' : 'text-ink-3'
                    )}
                  >
                    <span>
                      {new Date(m.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {isMe && <CheckCheck size={13} className="text-white/90" />}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts Bar (Compact & Horizontal Scroll) */}
      <div className="px-3 py-1.5 border-t border-line/40 bg-surface flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
        <span className="text-[10px] font-bold text-ink-3 shrink-0 uppercase tracking-wider">
          Quick:
        </span>
        <button
          onClick={() => sendQuickPrompt('Approved! Please proceed with final scheduling.')}
          className="px-2.5 py-1 rounded-lg bg-surface-2 hover:bg-surface-3 text-[11px] text-ink-2 hover:text-ink shrink-0 border border-line/60 transition-colors"
        >
          ✅ Proceed with scheduling
        </button>
        <button
          onClick={() => sendQuickPrompt('When will the revised cut be ready for review?')}
          className="px-2.5 py-1 rounded-lg bg-surface-2 hover:bg-surface-3 text-[11px] text-ink-2 hover:text-ink shrink-0 border border-line/60 transition-colors"
        >
          🕒 Revision timeline?
        </button>
        <button
          onClick={() => sendQuickPrompt('Thank you team, love the work!')}
          className="px-2.5 py-1 rounded-lg bg-surface-2 hover:bg-surface-3 text-[11px] text-ink-2 hover:text-ink shrink-0 border border-line/60 transition-colors"
        >
          🙌 Thank you!
        </button>
      </div>

      {/* Pending Uploads Chips (Preview bar before sending) */}
      {pendingUploads.length > 0 && (
        <div className="px-3 py-2 border-t border-line/60 bg-surface-2/40 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
          {pendingUploads.map((item) => (
            <div
              key={item.id}
              className={clsx(
                'flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs shrink-0 shadow-xs',
                item.error
                  ? 'border-danger/40 bg-danger-soft text-danger-ink'
                  : 'border-line bg-surface text-ink'
              )}
            >
              {item.type === 'IMAGE' && item.previewUrl ? (
                <img
                  src={item.previewUrl}
                  alt="preview"
                  className="h-7 w-7 rounded-md object-cover"
                />
              ) : item.type === 'VIDEO' ? (
                <VideoIcon size={16} className="text-purple-500" />
              ) : item.type === 'AUDIO' ? (
                <Mic size={16} className="text-amber-500" />
              ) : (
                <FileText size={16} className="text-primary" />
              )}

              <div className="min-w-0 max-w-[130px]">
                <p className="text-[11px] font-semibold truncate leading-tight">
                  {item.file.name}
                </p>
                <span className="text-[9px] text-ink-3">
                  {formatFileSize(item.file.size)}
                </span>
              </div>

              {item.uploading ? (
                <Spinner size={14} />
              ) : (
                <button
                  type="button"
                  onClick={() => removePendingUpload(item.id)}
                  className="p-1 rounded-md text-ink-3 hover:text-danger hover:bg-surface-2"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Voice Recording Active Bar */}
      {isRecording && (
        <div className="px-3 py-2.5 border-t border-line bg-amber-50 dark:bg-amber-950/40 flex items-center justify-between gap-3 shrink-0 animate-pulse">
          <div className="flex items-center gap-2.5">
            <span className="h-3 w-3 rounded-full bg-red-500 animate-ping" />
            <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
              Recording Voice Note: {Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => stopRecording(false)}
              className="px-2.5 py-1 rounded-lg bg-surface border border-line text-xs font-semibold text-danger hover:bg-danger-soft transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => stopRecording(true)}
              className="px-3 py-1 rounded-lg bg-primary text-white text-xs font-bold shadow-xs hover:bg-primary-hover transition-colors"
            >
              Attach Audio
            </button>
          </div>
        </div>
      )}

      {/* Chat Input & Media Actions Bar */}
      <form
        onSubmit={handleSend}
        className="p-2.5 sm:p-3 border-t border-line bg-surface flex items-end gap-2 shrink-0 relative"
      >
        {/* Attachment Options Popover */}
        {showAttachMenu && (
          <div className="absolute bottom-16 left-3 z-30 w-52 rounded-2xl border border-line bg-surface p-2 shadow-pop space-y-1 animate-in fade-in zoom-in-95 duration-150">
            <button
              type="button"
              onClick={() => {
                setShowAttachMenu(false);
                photoInputRef.current?.click();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-ink hover:bg-surface-2 transition-colors text-left"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600">
                <ImageIcon size={16} />
              </div>
              <div>
                <span>Photo / Image</span>
                <p className="text-[10px] text-ink-3">JPG, PNG, WebP</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowAttachMenu(false);
                videoInputRef.current?.click();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-ink hover:bg-surface-2 transition-colors text-left"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600">
                <VideoIcon size={16} />
              </div>
              <div>
                <span>Video Footage</span>
                <p className="text-[10px] text-ink-3">MP4, MOV, WebM</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowAttachMenu(false);
                docInputRef.current?.click();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-ink hover:bg-surface-2 transition-colors text-left"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600">
                <FileText size={16} />
              </div>
              <div>
                <span>Documents</span>
                <p className="text-[10px] text-ink-3">PDF, Word, Excel</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowAttachMenu(false);
                audioInputRef.current?.click();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-ink hover:bg-surface-2 transition-colors text-left"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600">
                <Mic size={16} />
              </div>
              <div>
                <span>Audio File</span>
                <p className="text-[10px] text-ink-3">MP3, WAV, Voice</p>
              </div>
            </button>
          </div>
        )}

        {/* Attachment Toggle Button */}
        <button
          type="button"
          onClick={() => setShowAttachMenu((prev) => !prev)}
          title="Add photo, video, audio, or document"
          className={clsx(
            'h-10 w-10 shrink-0 flex items-center justify-center rounded-xl border transition-all',
            showAttachMenu
              ? 'border-primary bg-primary text-white shadow-xs'
              : 'border-line bg-surface-2 hover:bg-surface-3 text-ink-2 hover:text-ink'
          )}
        >
          <Plus size={18} className={clsx('transition-transform duration-200', showAttachMenu && 'rotate-45')} />
        </button>

        {/* Quick Voice Record Trigger Button */}
        <button
          type="button"
          onClick={isRecording ? () => stopRecording(true) : startRecording}
          title={isRecording ? 'Stop recording voice note' : 'Record voice note'}
          className={clsx(
            'h-10 w-10 shrink-0 flex items-center justify-center rounded-xl border transition-all',
            isRecording
              ? 'border-red-500 bg-red-500 text-white animate-pulse'
              : 'border-line bg-surface-2 hover:bg-surface-3 text-ink-2 hover:text-ink'
          )}
        >
          <Mic size={17} />
        </button>

        {/* Text Message Area */}
        <div className="flex-1 relative min-w-0">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Type a message to your agency team..."
            className="w-full resize-none rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-xs sm:text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-primary/20 max-h-28 leading-relaxed"
          />
        </div>

        {/* Send Button */}
        <Button
          type="submit"
          variant="primary"
          size="md"
          loading={sending || pendingUploads.some((p) => p.uploading)}
          disabled={!text.trim() && pendingUploads.length === 0}
          icon={<Send size={16} />}
          className="shrink-0 h-10 w-10 !p-0 rounded-xl"
        />
      </form>

      {/* Full-screen Image Modal / Lightbox */}
      {previewImageModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => setPreviewImageModal(null)}
        >
          <button
            onClick={() => setPreviewImageModal(null)}
            className="absolute top-4 right-4 p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X size={20} />
          </button>
          <img
            src={previewImageModal}
            alt="Preview"
            className="max-h-[90vh] max-w-[95vw] rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
