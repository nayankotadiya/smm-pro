import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { useCan } from '@/store/auth';

export const useTeam = () => useQuery({ queryKey: ['team'], queryFn: () => get<any[]>('/team'), staleTime: 60_000 });
export function useClients() { const can = useCan(); return useQuery({ queryKey: ['clients', 'all'], queryFn: () => get<any[]>('/clients'), staleTime: 30_000, enabled: can('clients.read') }); }
export const useContentOptions = () => useQuery({ queryKey: ['content', 'options'], queryFn: () => get<any>('/content', { limit: 100 }).then((r) => r.items as any[]), staleTime: 30_000 });
