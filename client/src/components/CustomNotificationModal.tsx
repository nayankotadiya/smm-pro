import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Send,
  Bell,
  AlertTriangle,
  Users,
  Shield,
  Sparkles,
  CheckSquare,
  Square,
  Search,
  ExternalLink,
} from 'lucide-react';
import { Button, Field, Input, Modal, Select, Textarea, Badge, Avatar } from './ui';
import { post, errMsg } from '@/lib/api';
import { toast } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { useTeam } from '@/hooks/useData';
import { roleLabel } from '@/lib/format';

const TEMPLATES = [
  {
    title: '🚨 Emergency Shoot Update',
    message: 'Attention team: Client shoot schedule or location has been updated. Please check the shoot tab immediately.',
    category: 'WORKFLOW',
    critical: true,
  },
  {
    title: '⚡ High Priority Review Required',
    message: 'A final video / script review is urgently needed before end of day. Please review your pending approvals.',
    category: 'APPROVAL',
    critical: true,
  },
  {
    title: '📅 Team Briefing & Standup in 15m',
    message: 'Quick sync call in 15 minutes to review today’s reel deliveries and client priorities.',
    category: 'SYSTEM',
    critical: false,
  },
  {
    title: '📢 Studio Announcement',
    message: 'New brand guidelines and asset libraries have been uploaded. Please adhere to these for upcoming edits.',
    category: 'SYSTEM',
    critical: false,
  },
  {
    title: '⏳ Milestone Deadline Today',
    message: 'Gentle reminder that all pending scheduled deliverables for today must be completed before 6:00 PM.',
    category: 'DEADLINE',
    critical: true,
  },
];

const TARGET_ROLES = [
  'SCRIPT_WRITER',
  'SHOOTER',
  'EDITOR',
  'SMM',
  'MANAGER',
  'ADMIN',
] as const;

export function CustomNotificationModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const team = useTeam();

  const [targetType, setTargetType] = useState<'ALL' | 'ROLE' | 'USERS'>('ALL');
  const [selectedRole, setSelectedRole] = useState<string>('EDITOR');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [searchUser, setSearchUser] = useState('');

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<string>('SYSTEM');
  const [critical, setCritical] = useState<boolean>(false);
  const [link, setLink] = useState('');
  const [sending, setSending] = useState(false);

  // Accessible ONLY to SUPER_ADMIN, ADMIN, MANAGER
  const canSend =
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'ADMIN' ||
    user?.role === 'MANAGER';

  // Active team members (super admin is already filtered out from useTeam if non-super-admin)
  const activeMembers = useMemo(() => {
    return (team.data || []).filter((u: any) => u.active);
  }, [team.data]);

  const filteredMembers = useMemo(() => {
    if (!searchUser.trim()) return activeMembers;
    const q = searchUser.toLowerCase();
    return activeMembers.filter(
      (u: any) =>
        u.name.toLowerCase().includes(q) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.role && u.role.toLowerCase().includes(q))
    );
  }, [activeMembers, searchUser]);

  const recipientCount = useMemo(() => {
    if (targetType === 'ALL') {
      return Math.max(0, activeMembers.length - 1); // exclude sender
    }
    if (targetType === 'ROLE') {
      return activeMembers.filter((u: any) => u.role === selectedRole).length;
    }
    return selectedUserIds.length;
  }, [targetType, selectedRole, selectedUserIds, activeMembers]);

  if (!canSend) return null;

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllFiltered = () => {
    const ids = filteredMembers.map((m: any) => m._id);
    setSelectedUserIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const clearSelection = () => {
    setSelectedUserIds([]);
  };

  const applyTemplate = (t: typeof TEMPLATES[0]) => {
    setTitle(t.title);
    setMessage(t.message);
    setCategory(t.category);
    setCritical(t.critical);
  };

  const handleSend = async () => {
    if (!title.trim()) {
      toast.error('Please enter a notification title');
      return;
    }
    if (!message.trim()) {
      toast.error('Please enter a notification message');
      return;
    }
    if (targetType === 'USERS' && !selectedUserIds.length) {
      toast.error('Please select at least one recipient');
      return;
    }

    setSending(true);
    try {
      const res = await post<any>('/notifications/custom', {
        targetType,
        role: targetType === 'ROLE' ? selectedRole : undefined,
        userIds: targetType === 'USERS' ? selectedUserIds : undefined,
        title: title.trim(),
        message: message.trim(),
        category,
        critical,
        link: link.trim() || undefined,
      });

      toast.success(
        `Custom alert sent to ${res.deliveredCount || res.recipientCount} team member(s)!`
      );
      qc.invalidateQueries({ queryKey: ['notifications'] });

      // Reset fields
      setTitle('');
      setMessage('');
      setLink('');
      setCritical(false);
      setSelectedUserIds([]);
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary-ink">
            <Send size={16} />
          </div>
          <div>
            <div className="font-bold text-ink">Custom Notification Send Box</div>
            <div className="text-[11.5px] font-normal text-ink-3">
              Broadcast targeted alerts, mobile pushes & in-app notifications to team
            </div>
          </div>
        </div>
      }
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div className="text-xs font-medium text-ink-2">
            Target reach: <span className="font-bold text-primary-ink">{recipientCount} recipient(s)</span>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={<Send size={14} />}
              loading={sending}
              disabled={!title.trim() || !message.trim() || (targetType === 'USERS' && !selectedUserIds.length)}
              onClick={handleSend}
            >
              Send Notification
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {/* Quick Templates */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 font-semibold text-ink-2">
            <Sparkles size={13} className="text-amber-500" />
            Quick Templates
          </label>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATES.map((t, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => applyTemplate(t)}
                className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink hover:border-primary/50 hover:bg-primary-soft hover:text-primary-ink transition-colors"
              >
                {t.title}
              </button>
            ))}
          </div>
        </div>

        {/* Target Audience Selector */}
        <div className="rounded-xl border border-line bg-surface-2/60 p-3">
          <label className="mb-2 block font-semibold text-ink">Select Recipients</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setTargetType('ALL')}
              className={`flex flex-col items-center justify-center rounded-lg border p-2.5 text-center transition-all ${
                targetType === 'ALL'
                  ? 'border-primary bg-primary-soft font-bold text-primary-ink shadow-sm'
                  : 'border-line bg-surface text-ink-2 hover:bg-surface-3'
              }`}
            >
              <Users size={18} className="mb-1" />
              <span>All Team</span>
              <span className="text-[10px] opacity-75">Entire Agency</span>
            </button>

            <button
              type="button"
              onClick={() => setTargetType('ROLE')}
              className={`flex flex-col items-center justify-center rounded-lg border p-2.5 text-center transition-all ${
                targetType === 'ROLE'
                  ? 'border-primary bg-primary-soft font-bold text-primary-ink shadow-sm'
                  : 'border-line bg-surface text-ink-2 hover:bg-surface-3'
              }`}
            >
              <Shield size={18} className="mb-1" />
              <span>By Role</span>
              <span className="text-[10px] opacity-75">Specific Group</span>
            </button>

            <button
              type="button"
              onClick={() => setTargetType('USERS')}
              className={`flex flex-col items-center justify-center rounded-lg border p-2.5 text-center transition-all ${
                targetType === 'USERS'
                  ? 'border-primary bg-primary-soft font-bold text-primary-ink shadow-sm'
                  : 'border-line bg-surface text-ink-2 hover:bg-surface-3'
              }`}
            >
              <CheckSquare size={18} className="mb-1" />
              <span>Specific Users</span>
              <span className="text-[10px] opacity-75">{selectedUserIds.length} Selected</span>
            </button>
          </div>

          {/* Role selector */}
          {targetType === 'ROLE' && (
            <div className="mt-3 pt-3 border-t border-line/60">
              <label className="mb-1.5 block font-semibold text-ink-2">Select Team Role</label>
              <div className="flex flex-wrap gap-1.5">
                {TARGET_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setSelectedRole(r)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      selectedRole === r
                        ? 'border-primary bg-primary text-white shadow-sm'
                        : 'border-line bg-surface text-ink-2 hover:bg-surface-3'
                    }`}
                  >
                    {roleLabel(r)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* User multi-select list */}
          {targetType === 'USERS' && (
            <div className="mt-3 pt-3 border-t border-line/60 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-2.5 top-2.5 text-ink-3" />
                  <Input
                    className="pl-8 text-xs py-1.5"
                    placeholder="Search member by name or role..."
                    value={searchUser}
                    onChange={(e) => setSearchUser(e.target.value)}
                  />
                </div>
                <div className="flex gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={selectAllFiltered}
                    className="font-semibold text-primary hover:underline"
                  >
                    Select All
                  </button>
                  <span className="text-ink-3">·</span>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="font-semibold text-ink-3 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="max-h-44 overflow-y-auto rounded-lg border border-line bg-surface divide-y divide-line/60">
                {filteredMembers.length === 0 ? (
                  <div className="p-3 text-center text-xs text-ink-3">No members found</div>
                ) : (
                  filteredMembers.map((m: any) => {
                    const isSelected = selectedUserIds.includes(m._id);
                    return (
                      <div
                        key={m._id}
                        onClick={() => toggleUser(m._id)}
                        className={`flex items-center justify-between p-2 cursor-pointer hover:bg-surface-2 transition-colors ${
                          isSelected ? 'bg-primary-soft/40' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {isSelected ? (
                            <CheckSquare size={16} className="text-primary flex-shrink-0" />
                          ) : (
                            <Square size={16} className="text-ink-3 flex-shrink-0" />
                          )}
                          <Avatar name={m.name} size={24} />
                          <span className="font-semibold text-ink">{m.name}</span>
                        </div>
                        <Badge t="neutral">{roleLabel(m.role)}</Badge>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Message Content */}
        <div className="space-y-3">
          <Field label="Notification Title" hint={`${title.length}/120 characters`}>
            <Input
              placeholder="e.g. 🚨 Urgent Client Shoot Rescheduled"
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>

          <Field label="Notification Details / Message" hint={`${message.length}/1000 characters`}>
            <Textarea
              rows={4}
              maxLength={1000}
              placeholder="Provide clear context, instructions, or updates for the team..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </Field>
        </div>

        {/* Category, Priority & Action Link */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Notification Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="SYSTEM">System Announcement</option>
              <option value="TASK">Task Update</option>
              <option value="APPROVAL">Review / Approval</option>
              <option value="WORKFLOW">Workflow Alert</option>
              <option value="DEADLINE">Deadline Notice</option>
              <option value="REMINDER">Reminder</option>
              <option value="CHAT">Chat Alert</option>
            </Select>
          </Field>

          <Field label="Action Link (Optional)" hint="Relative app link e.g. /tasks, /calendar">
            <Input
              placeholder="/content/6704..."
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          </Field>
        </div>

        {/* Urgent Alert Toggle */}
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-rose-500 text-rose-600 focus:ring-rose-500"
              checked={critical}
              onChange={(e) => setCritical(e.target.checked)}
            />
            <div>
              <span className="flex items-center gap-1 font-bold text-ink">
                <AlertTriangle size={14} className="text-rose-500" />
                Urgent Priority Alert (Forces Sound & Notification)
              </span>
              <p className="text-[11.5px] text-ink-2 mt-0.5 leading-relaxed">
                Bypasses muted categories, triggers device vibration and browser push banners immediately on mobile and desktop.
              </p>
            </div>
          </label>
        </div>
      </div>
    </Modal>
  );
}
