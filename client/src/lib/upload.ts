import axios from 'axios';
import { api, post, errMsg, DIRECT_URL } from './api';
import { useUI, toast } from '@/store/ui';
import { setActivity } from './socket';

export interface UploadOpts { file: File; category: string; contentId?: string; clientId?: string; onDone?: (media: any) => void; silent?: boolean }

/**
 * Two-step upload with real progress:
 *  1) API validates, auto-names the file and returns a resumable Google Drive URL (bytes go browser -> Drive directly)
 *  2) API verifies the Drive file and runs the workflow (stage, tasks, notifications, chat)
 * Without Drive configured the same flow uploads to the API's local storage.
 */
export function startUpload(o: UploadOpts): Promise<any> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ui = useUI.getState();
  const ctrl = new AbortController();
  let mediaId: string | undefined;
  const run = async (): Promise<any> => {
    ui.setUpload({ id, fileName: o.file.name, progress: 0, status: 'uploading', cancel: () => ctrl.abort() });
    try {
      const init = await post('/media/upload', { contentId: o.contentId, clientId: o.clientId, category: o.category, fileName: o.file.name, mimeType: o.file.type || 'application/octet-stream', size: o.file.size });
      mediaId = init.mediaId;
      const set = (progress: number, status: any = 'uploading') => useUI.getState().setUpload({ id, fileName: init.fileName, progress, status, cancel: () => ctrl.abort() });
      set(0); setActivity(`Uploading ${init.fileName}`);
      let media: any;
      if (init.mode === 'DRIVE') {
        const r = await axios.put(init.uploadUrl, o.file, { signal: ctrl.signal, headers: { 'Content-Type': o.file.type || 'application/octet-stream' }, onUploadProgress: (e) => set(Math.min(99, Math.round((e.loaded / (e.total || o.file.size)) * 100))) });
        set(100, 'processing');
        media = await post(`/media/${init.mediaId}/complete`, { driveFileId: r.data.id });
      } else {
        const fd = new FormData(); fd.append('file', o.file);
        const r = await api.post(init.uploadUrl.replace(/^\/api/, ''), fd, { signal: ctrl.signal, onUploadProgress: (e) => set(Math.min(99, Math.round((e.loaded / (e.total || o.file.size)) * 100))) });
        media = r.data;
      }
      useUI.getState().setUpload({ id, fileName: init.fileName, progress: 100, status: 'done' });
      setTimeout(() => useUI.getState().removeUpload(id), 5000);
      if (!o.silent) toast.success(`${init.fileName} uploaded successfully.`);
      setActivity('');
      o.onDone?.(media);
      return media;
    } catch (e: any) {
      setActivity('');
      const cancelled = axios.isCancel(e);
      if (mediaId) post(`/media/${mediaId}/fail`, { error: cancelled ? 'Cancelled' : errMsg(e) }).catch(() => undefined);
      const msg = cancelled ? 'Upload cancelled' : errMsg(e, 'Upload failed. Retry.');
      useUI.getState().setUpload({ id, fileName: o.file.name, progress: 0, status: cancelled ? 'cancelled' : 'error', error: msg, retry: () => { void startUpload(o); useUI.getState().removeUpload(id); } });
      if (cancelled) setTimeout(() => useUI.getState().removeUpload(id), 3000);
      throw e;
    }
  };
  return run();
}

/** Short-lived signed URLs so <video>, <img> and downloads work without exposing the access token */
export async function mediaLinks(mediaId: string): Promise<{ stream: string; download: string; drive: string | null }> {
  const l = await post(`/media/${mediaId}/link`);
  return { stream: DIRECT_URL + l.stream, download: DIRECT_URL + l.download, drive: l.drive };
}
