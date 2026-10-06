import { useState, useRef, ChangeEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Upload, Plus, Film, Image as ImageIcon, Music, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { get } from '@/lib/api';
import { startUpload } from '@/lib/upload';
import { toast } from '@/store/ui';
import { Async, Badge, Button, Card, Empty, Input, Modal, PageHeader, Select, Table, Tabs } from '@/components/ui';
import { FileCard, MediaButtons, MediaThumb, fileIcon, useMediaActions } from '@/components/Media';
import { useClients, useTeam, useContentOptions } from '@/hooks/useData';
import { fmtDateTime, fmtSize, label } from '@/lib/format';

const GROUPS = [['all', 'All'], ['raw', 'Raw'], ['editing', 'Editing'], ['review', 'Review'], ['final', 'Final'], ['images', 'Images'], ['documents', 'Documents'], ['audio', 'Audio']] as const;

function UploadMediaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const clients = useClients();
  const contents = useContentOptions();
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<string>('RAW');
  const [clientId, setClientId] = useState<string>('');
  const [contentId, setContentId] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilePick = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setFile(picked);
    const mime = picked.type.toLowerCase();
    const ext = picked.name.split('.').pop()?.toLowerCase() || '';
    if (mime.startsWith('video/') || ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'wmv'].includes(ext)) {
      setCategory('RAW');
    } else if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
      setCategory('IMAGE');
    } else if (mime.startsWith('audio/') || ['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac'].includes(ext)) {
      setCategory('AUDIO');
    } else {
      setCategory('DOCUMENT');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      setFile(dropped);
      const mime = dropped.type.toLowerCase();
      const ext = dropped.name.split('.').pop()?.toLowerCase() || '';
      if (mime.startsWith('video/') || ['mp4', 'mov', 'mkv', 'avi', 'webm'].includes(ext)) {
        setCategory('RAW');
      } else if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
        setCategory('IMAGE');
      } else if (mime.startsWith('audio/') || ['mp3', 'wav', 'aac', 'm4a', 'ogg'].includes(ext)) {
        setCategory('AUDIO');
      } else {
        setCategory('DOCUMENT');
      }
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      toast.error('Please choose a file to upload.');
      return;
    }
    setUploading(true);
    try {
      await startUpload({
        file,
        category,
        clientId: clientId || undefined,
        contentId: contentId || undefined,
        onDone: () => {
          qc.invalidateQueries({ queryKey: ['media'] });
          toast.success(`${file.name} uploaded successfully!`);
          setFile(null);
          onClose();
        },
      });
    } catch {
      // errors handled inside startUpload
    } finally {
      setUploading(false);
    }
  };

  const filteredContents = clientId
    ? (contents.data || []).filter((c) => String(c.clientId?._id || c.clientId) === clientId)
    : contents.data || [];

  return (
    <Modal
      open={open}
      onClose={() => !uploading && onClose()}
      title={
        <div className="flex items-center gap-2">
          <Upload size={18} className="text-primary-ink" />
          <span>Upload File</span>
        </div>
      }
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={uploading}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={uploading} disabled={!file} icon={<Upload size={15} />}>
            Upload Now
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Drop zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line-strong/80 bg-surface-2/60 p-6 text-center transition-all hover:border-primary hover:bg-surface-3/80"
        >
          <input
            ref={fileInputRef}
            type="file"
            hidden
            onChange={handleFilePick}
            accept="*/*"
          />
          {file ? (
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 shadow-sm">
                <CheckCircle size={24} />
              </div>
              <div className="max-w-[280px] truncate font-semibold text-ink sm:max-w-[360px]">{file.name}</div>
              <div className="text-meta text-ink-2">{fmtSize(file.size)} · Click to change file</div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-ink-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary-ink shadow-sm">
                <Upload size={24} />
              </div>
              <div className="font-semibold text-ink">Choose a file or drag & drop here</div>
              <div className="text-meta text-ink-3">Videos, Images, Audios, Documents up to 4 GB</div>
            </div>
          )}
        </div>

        {/* Category */}
        <div>
          <label className="mb-1 block text-meta font-medium text-ink-2">Category / File Type</label>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <optgroup label="Video">
              <option value="RAW">Raw Footage (Video)</option>
              <option value="EDIT">Edited Video (Video)</option>
              <option value="FINAL">Final Export (Video)</option>
            </optgroup>
            <optgroup label="Images & Graphics">
              <option value="IMAGE">Image / Graphic</option>
              <option value="THUMBNAIL">Thumbnail</option>
              <option value="BRAND_ASSET">Brand Asset (Logo, Font)</option>
            </optgroup>
            <optgroup label="Audio">
              <option value="AUDIO">Audio / Voiceover / Music</option>
            </optgroup>
            <optgroup label="Documents">
              <option value="DOCUMENT">Document / Script</option>
              <option value="REFERENCE">Reference File</option>
            </optgroup>
          </Select>
        </div>

        {/* Optional Client */}
        <div>
          <label className="mb-1 block text-meta font-medium text-ink-2">Assign to Client (Optional)</label>
          <Select value={clientId} onChange={(e) => { setClientId(e.target.value); setContentId(''); }}>
            <option value="">None / General Organization File</option>
            {(clients.data || []).map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        {/* Optional Content */}
        {filteredContents.length > 0 && (
          <div>
            <label className="mb-1 block text-meta font-medium text-ink-2">Link to Specific Content (Optional)</label>
            <Select value={contentId} onChange={(e) => setContentId(e.target.value)}>
              <option value="">None / No specific content</option>
              {filteredContents.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.contentId} — {c.title}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function MediaLibrary() {
  const [sp, setSp] = useSearchParams();
  const a = useMediaActions();
  const clients = useClients();
  const team = useTeam();
  const [uploadOpen, setUploadOpen] = useState(false);
  const g = sp.get('group') || 'all';
  const params: any = { ...(g !== 'all' ? { group: g } : {}), ...Object.fromEntries(['q', 'clientId', 'uploadedBy', 'version', 'from', 'to', 'latest'].filter((k) => sp.get(k)).map((k) => [k, sp.get(k)])) };
  const q = useQuery({ queryKey: ['media', 'library', params], queryFn: () => get<any[]>('/media', params) });
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };

  return (
    <>
      <PageHeader
        title="Media"
        sub="All files across content. Stored in Google Drive, with access controlled here."
        actions={
          <Button variant="primary" icon={<Upload size={16} />} onClick={() => setUploadOpen(true)}>
            Upload File
          </Button>
        }
      />
      <Tabs value={g as any} onChange={(k) => set('group', k === 'all' ? '' : k)} tabs={GROUPS.map(([key, l]) => ({ key, label: l }))} />
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        <Input className="col-span-2" placeholder="Search content ID, client or filename" value={sp.get('q') || ''} onChange={(e) => set('q', e.target.value)} />
        <Select aria-label="Client" value={sp.get('clientId') || ''} onChange={(e) => set('clientId', e.target.value)}><option value="">All clients</option>{(clients.data || []).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</Select>
        <Select aria-label="Uploaded by" value={sp.get('uploadedBy') || ''} onChange={(e) => set('uploadedBy', e.target.value)}><option value="">Uploaded by anyone</option>{(team.data || []).map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}</Select>
        <Select aria-label="Version" value={sp.get('latest') ? 'latest' : sp.get('version') || ''} onChange={(e) => { const n = new URLSearchParams(sp); n.delete('latest'); n.delete('version'); if (e.target.value === 'latest') n.set('latest', '1'); else if (e.target.value) n.set('version', e.target.value); setSp(n, { replace: true }); }}><option value="">All versions</option><option value="latest">Latest only</option>{[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>V{v}</option>)}</Select>
        <Input type="date" aria-label="From date" value={sp.get('from') || ''} onChange={(e) => set('from', e.target.value)} />
        <Input type="date" aria-label="To date" value={sp.get('to') || ''} onChange={(e) => set('to', e.target.value)} />
      </div>
      <Card pad={false}>
        <Async
          q={q}
          empty={
            <div className="p-8 text-center">
              <Empty
                title="No files match"
                hint="No files uploaded yet. Click Upload File above to upload images, videos, audios or documents."
              />
              <Button className="mt-4" variant="primary" icon={<Upload size={16} />} onClick={() => setUploadOpen(true)}>
                Upload File
              </Button>
            </div>
          }
        >
          {(d: any[]) => (
            <>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 p-4 md:hidden">
                {d.map((m) => <FileCard key={m._id} m={m} a={a} />)}
              </div>
              <div className="hidden md:block">
                <Table head={['File', 'Content', 'Client', 'Type', 'Version', 'Uploaded by', 'Date', 'Size', 'Status', '']} minWidth={1100}>
                  {d.map((m) => (
                    <tr key={m._id} className="group hover:bg-surface-2 transition-colors">
                      <td className="td">
                        <span className="flex items-center gap-2">
                          <span className="text-ink-2">{fileIcon(m.mimeType)}</span>
                          <span className="max-w-[260px] truncate font-semibold text-ink group-hover:text-primary-ink transition-colors" title={m.fileName}>
                            {m.fileName}
                          </span>
                        </span>
                      </td>
                      <td className="td font-mono font-medium text-ink-3">
                        {m.contentId ? <Link className="hover:text-primary-ink" to={`/content/${m.contentId._id}?tab=files`}>{m.contentId.contentId}</Link> : '—'}
                      </td>
                      <td className="td font-medium text-ink-2">{m.clientId?.name || '—'}</td>
                      <td className="td font-medium text-ink-2">{label(m.category)}</td>
                      <td className="td tabular font-medium text-ink">{m.version ? `V${m.versionNumber}` : '—'}</td>
                      <td className="td font-medium text-ink">{m.uploadedBy?.name}</td>
                      <td className="td whitespace-nowrap text-meta font-medium text-ink-2">{fmtDateTime(m.uploadedAt || m.createdAt)}</td>
                      <td className="td whitespace-nowrap tabular font-medium text-ink-2">{fmtSize(m.size)}</td>
                      <td className="td">
                        <Badge status={m.status} t={m.status === 'SUPERSEDED' ? 'neutral' : undefined}>
                          {m.status === 'SUPERSEDED' ? 'Previous' : undefined}
                        </Badge>
                      </td>
                      <td className="td"><MediaButtons m={m} a={a} compact /></td>
                    </tr>
                  ))}
                </Table>
              </div>
            </>
          )}
        </Async>
      </Card>
      {a.modal}
      <UploadMediaModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </>
  );
}
