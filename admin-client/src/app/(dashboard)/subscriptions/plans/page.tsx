'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Edit2, Trash2, Save, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';

type PlanType = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY';

interface Plan {
  id: string;
  type: PlanType;
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  isActive: boolean;
}

export default function PlansPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Plan>>({});

  const { data: plans, isLoading } = useQuery({
    queryKey: ['admin-plans'],
    queryFn: async () => {
      const response = await api.get('/subscriptions/admin/plans');
      return response.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Plan> }) => {
      const response = await api.put(`/subscriptions/admin/plans/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
      setEditingPlan(null);
      toast({
        title: 'Plano atualizado',
        description: 'O plano foi atualizado com sucesso.',
      });
    },
    onError: () => {
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o plano.',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete(`/subscriptions/admin/plans/${id}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
      toast({
        title: 'Plano desativado',
        description: 'O plano foi desativado com sucesso.',
      });
    },
    onError: () => {
      toast({
        title: 'Erro',
        description: 'Não foi possível desativar o plano.',
        variant: 'destructive',
      });
    },
  });

  const handleEdit = (plan: Plan) => {
    setEditingPlan(plan.id);
    setFormData({
      name: plan.name,
      description: plan.description,
      price: plan.price,
      isActive: plan.isActive,
    });
  };

  const handleSave = (id: string) => {
    updateMutation.mutate({ id, data: formData });
  };

  const handleCancel = () => {
    setEditingPlan(null);
    setFormData({});
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
        <h1 className="text-3xl font-bold">Gerenciamento de Planos</h1>
        <p className="text-muted-foreground">
          Configure os valores e disponibilidade dos planos de assinatura
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
        {plans?.map((plan: Plan) => (
          <Card key={plan.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  {editingPlan === plan.id ? (
                    <Input
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className="text-xl font-bold"
                    />
                  ) : (
                    plan.name
                  )}
                </CardTitle>
                <Badge variant={plan.isActive ? 'default' : 'secondary'}>
                  {plan.isActive ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
              <CardDescription>{getPlanTypeLabel(plan.type)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Descrição</Label>
                {editingPlan === plan.id ? (
                  <Input
                    value={formData.description || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Descrição do plano"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {plan.description || 'Sem descrição'}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Preço</Label>
                {editingPlan === plan.id ? (
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) =>
                      setFormData({ ...formData, price: parseFloat(e.target.value) })
                    }
                    className="font-bold text-2xl"
                  />
                ) : (
                  <p className="text-2xl font-bold">
                    R$ {plan.price.toFixed(2)}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Duração</Label>
                <p className="text-sm">
                  {plan.durationDays} dias
                </p>
              </div>

              <div className="flex gap-2 pt-4">
                {editingPlan === plan.id ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() => handleSave(plan.id)}
                      disabled={updateMutation.isPending}
                      className="flex-1"
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Salvar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCancel}
                      className="flex-1"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(plan)}
                      className="flex-1"
                    >
                      <Edit2 className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteMutation.mutate(plan.id)}
                      disabled={deleteMutation.isPending}
                      className="flex-1"
                    >
                      {deleteMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-2" />
                      )}
                      Desativar
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
