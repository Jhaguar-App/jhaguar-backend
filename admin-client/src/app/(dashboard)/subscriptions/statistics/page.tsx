'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Loader2, TrendingUp, Users, DollarSign, Calendar } from 'lucide-react';
import api from '@/lib/api';

type PlanType = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY';

export default function StatisticsPage() {
  const { data: statistics, isLoading } = useQuery({
    queryKey: ['admin-subscription-statistics'],
    queryFn: async () => {
      const response = await api.get('/subscriptions/admin/statistics');
      return response.data;
    },
  });

  const { data: expiringSoon } = useQuery({
    queryKey: ['expiring-soon'],
    queryFn: async () => {
      const response = await api.get('/subscriptions/admin/expiring-soon?days=7');
      return response.data;
    },
  });

  const getPlanTypeLabel = (type: PlanType) => {
    const labels = {
      WEEKLY: 'Semanal',
      BIWEEKLY: 'Quinzenal',
      MONTHLY: 'Mensal',
      QUARTERLY: 'Trimestral',
    };
    return labels[type];
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Estatísticas de Assinaturas</h1>
        <p className="text-muted-foreground">
          Visualize métricas e insights sobre os planos de assinatura
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Assinaturas Ativas
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statistics?.totalActiveSubscriptions || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Motoristas com plano ativo
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Receita do Mês
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {statistics?.revenueThisMonth?.toFixed(2) || '0.00'}
            </div>
            <p className="text-xs text-muted-foreground">
              Total arrecadado este mês
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Expirando em Breve
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {expiringSoon?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Próximos 7 dias
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Planos Expirados
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statistics?.totalExpired || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Total de planos expirados
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Tipo de Plano</CardTitle>
            <CardDescription>
              Quantidade de assinaturas ativas por plano
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {statistics?.planDistribution?.map((item: any) => (
                <div key={item.planId} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="font-medium">{item.planName}</div>
                    <div className="text-sm text-muted-foreground">
                      ({getPlanTypeLabel(item.planType)})
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-2xl font-bold">{item.count}</div>
                    <div className="text-sm text-muted-foreground">
                      {Math.round(
                        (item.count / statistics.totalActiveSubscriptions) * 100
                      )}
                      %
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assinaturas Expirando</CardTitle>
            <CardDescription>
              Próximas renovações nos próximos 7 dias
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {expiringSoon?.slice(0, 5).map((subscription: any) => (
                <div
                  key={subscription.id}
                  className="flex items-center justify-between border-b pb-2 last:border-0"
                >
                  <div>
                    <div className="font-medium">
                      {subscription.driver.User.firstName}{' '}
                      {subscription.driver.User.lastName}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {subscription.plan.name}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">
                      {new Date(subscription.endDate).toLocaleDateString('pt-BR')}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {Math.ceil(
                        (new Date(subscription.endDate).getTime() - Date.now()) /
                          (1000 * 60 * 60 * 24)
                      )}{' '}
                      dias
                    </div>
                  </div>
                </div>
              ))}
              {(!expiringSoon || expiringSoon.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma assinatura expirando em breve
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resumo Geral</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <div className="text-sm text-muted-foreground">Total Ativas</div>
              <div className="text-2xl font-bold">
                {statistics?.totalActiveSubscriptions || 0}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Expiradas</div>
              <div className="text-2xl font-bold">
                {statistics?.totalExpired || 0}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Pendentes</div>
              <div className="text-2xl font-bold">
                {statistics?.totalPending || 0}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Canceladas</div>
              <div className="text-2xl font-bold">
                {statistics?.totalCancelled || 0}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
