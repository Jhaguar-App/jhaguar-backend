'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import api from '@/lib/api';

type SubscriptionStatus = 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'PENDING_PAYMENT';
type PlanType = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY';

export default function ActiveSubscriptionsPage() {
  const [status, setStatus] = useState<SubscriptionStatus | 'ALL'>('ACTIVE');
  const [search, setSearch] = useState('');

  const { data: subscriptions, isLoading } = useQuery({
    queryKey: ['admin-active-subscriptions', status, search],
    queryFn: async () => {
      const params: any = {};
      if (status !== 'ALL') params.status = status;
      if (search) params.search = search;
      const response = await api.get('/subscriptions/admin/active-subscriptions', { params });
      return response.data;
    },
  });

  const getStatusBadge = (status: SubscriptionStatus) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge className="bg-green-500">Ativo</Badge>;
      case 'EXPIRED':
        return <Badge className="bg-red-500">Expirado</Badge>;
      case 'CANCELLED':
        return <Badge className="bg-gray-500">Cancelado</Badge>;
      case 'PENDING_PAYMENT':
        return <Badge className="bg-yellow-500">Pendente</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getPlanTypeLabel = (type: PlanType) => {
    const labels = {
      WEEKLY: 'Semanal',
      BIWEEKLY: 'Quinzenal',
      MONTHLY: 'Mensal',
      QUARTERLY: 'Trimestral',
    };
    return labels[type];
  };

  const formatDate = (date: string) => {
    return format(new Date(date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  const getDaysRemaining = (endDate: string) => {
    const now = new Date();
    const end = new Date(endDate);
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Assinaturas Ativas</h1>
        <p className="text-muted-foreground">
          Visualize e gerencie as assinaturas dos motoristas
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por motorista..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Tabs value={status} onValueChange={(v) => setStatus(v as any)}>
          <TabsList>
            <TabsTrigger value="ALL">Todas</TabsTrigger>
            <TabsTrigger value="ACTIVE">Ativas</TabsTrigger>
            <TabsTrigger value="EXPIRED">Expiradas</TabsTrigger>
            <TabsTrigger value="PENDING_PAYMENT">Pendentes</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Motorista</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Expiração</TableHead>
              <TableHead>Dias Restantes</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                </TableCell>
              </TableRow>
            ) : subscriptions?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  Nenhuma assinatura encontrada.
                </TableCell>
              </TableRow>
            ) : (
              subscriptions?.map((subscription: any) => {
                const daysRemaining = subscription.endDate
                  ? getDaysRemaining(subscription.endDate)
                  : null;

                return (
                  <TableRow key={subscription.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {subscription.driver.User.firstName}{' '}
                          {subscription.driver.User.lastName}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {subscription.driver.User.email}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{subscription.plan.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {getPlanTypeLabel(subscription.plan.type)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      R$ {subscription.amount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {subscription.startDate
                        ? formatDate(subscription.startDate)
                        : '-'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {subscription.endDate ? formatDate(subscription.endDate) : '-'}
                    </TableCell>
                    <TableCell>
                      {daysRemaining !== null ? (
                        <Badge
                          variant={
                            daysRemaining < 0
                              ? 'destructive'
                              : daysRemaining <= 3
                                ? 'secondary'
                                : 'default'
                          }
                        >
                          {daysRemaining < 0
                            ? 'Expirado'
                            : `${daysRemaining} dias`}
                        </Badge>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(subscription.status)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
