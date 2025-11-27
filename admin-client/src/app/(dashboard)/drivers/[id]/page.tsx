'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, CheckCircle, XCircle, ArrowLeft } from 'lucide-react';
import api from '@/lib/api';

export default function DriverDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id as string;

  const { data: driver, isLoading } = useQuery({
    queryKey: ['driver', id],
    queryFn: async () => {
      const response = await api.get(`/admin/drivers/${id}`);
      return response.data;
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ status }: { status: string }) => {
      await api.patch(`/admin/drivers/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver', id] });
      alert('Status do motorista atualizado com sucesso!');
    },
  });

  const updateVehicleStatusMutation = useMutation({
    mutationFn: async ({ status }: { status: string }) => {
      await api.patch(`/admin/drivers/${id}/vehicle-status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver', id] });
      alert('Status do veículo atualizado com sucesso!');
    },
  });

  const updateCategoriesMutation = useMutation({
    mutationFn: async (categories: string[]) => {
      await api.patch(`/admin/drivers/${id}/categories`, { categories });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver', id] });
      alert('Categorias atualizadas com sucesso!');
    },
  });

  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Initialize selected categories when data loads
  if (driver && selectedCategories.length === 0 && driver.DriverRideType) {
      const active = driver.DriverRideType.filter((dt: any) => dt.isActive).map((dt: any) => dt.RideTypeConfig.type);
      if (active.length > 0) setSelectedCategories(active);
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!driver) {
    return <div>Motorista não encontrado.</div>;
  }

  const handleCategoryChange = (category: string, checked: boolean) => {
    let newCategories = [...selectedCategories];
    if (checked) {
      newCategories.push(category);
    } else {
      newCategories = newCategories.filter((c) => c !== category);
    }
    setSelectedCategories(newCategories);
  };

  const saveCategories = () => {
    updateCategoriesMutation.mutate(selectedCategories);
  };

  const availableCategories = [
    { id: 'NORMAL', label: 'Normal' },
    { id: 'EXECUTIVO', label: 'Executivo' },
    { id: 'BLINDADO', label: 'Blindado' },
    { id: 'PET', label: 'Pet Friendly' },
    { id: 'MULHER', label: 'Mulher' },
    { id: 'DELIVERY', label: 'Entregas' },
    { id: 'MOTO', label: 'Moto' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-3xl font-bold">
          {driver.User.firstName} {driver.User.lastName}
        </h1>
        <Badge variant={driver.accountStatus === 'APPROVED' ? 'default' : 'secondary'}>
          {driver.accountStatus}
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informações Pessoais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <span className="font-semibold">Email:</span> {driver.User.email}
            </div>
            <div>
              <span className="font-semibold">Telefone:</span> {driver.User.phone}
            </div>
            <div>
              <span className="font-semibold">CNH:</span> {driver.licenseNumber}
            </div>
            <div className="pt-4 flex gap-2">
              <Button
                variant="outline"
                className="text-green-600 border-green-600 hover:bg-green-50"
                onClick={() => updateStatusMutation.mutate({ status: 'APPROVED' })}
                disabled={driver.accountStatus === 'APPROVED'}
              >
                <CheckCircle className="mr-2 h-4 w-4" /> Aprovar Motorista
              </Button>
              <Button
                variant="outline"
                className="text-red-600 border-red-600 hover:bg-red-50"
                onClick={() => updateStatusMutation.mutate({ status: 'REJECTED' })}
                disabled={driver.accountStatus === 'REJECTED'}
              >
                <XCircle className="mr-2 h-4 w-4" /> Rejeitar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Veículo</CardTitle>
            <CardDescription>
                Status: {driver.Vehicle?.inspectionStatus || 'N/A'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {driver.Vehicle ? (
              <>
                <div>
                  <span className="font-semibold">Modelo:</span> {driver.Vehicle.make} {driver.Vehicle.model}
                </div>
                <div>
                  <span className="font-semibold">Placa:</span> {driver.Vehicle.licensePlate}
                </div>
                <div>
                  <span className="font-semibold">Cor:</span> {driver.Vehicle.color}
                </div>
                <div>
                  <span className="font-semibold">Ano:</span> {driver.Vehicle.year}
                </div>
                 <div className="pt-4 flex gap-2">
                  <Button
                    variant="outline"
                    className="text-green-600 border-green-600 hover:bg-green-50"
                    onClick={() => updateVehicleStatusMutation.mutate({ status: 'APPROVED' })}
                    disabled={driver.Vehicle.inspectionStatus === 'APPROVED'}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" /> Aprovar Veículo
                  </Button>
                  <Button
                    variant="outline"
                    className="text-red-600 border-red-600 hover:bg-red-50"
                    onClick={() => updateVehicleStatusMutation.mutate({ status: 'REJECTED' })}
                    disabled={driver.Vehicle.inspectionStatus === 'REJECTED'}
                  >
                    <XCircle className="mr-2 h-4 w-4" /> Rejeitar
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-muted-foreground">Nenhum veículo cadastrado.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Categorias de Corrida</CardTitle>
          <CardDescription>
            Selecione as categorias permitidas para este motorista.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {availableCategories.map((cat) => (
              <div key={cat.id} className="flex items-center space-x-2">
                <Checkbox
                  id={cat.id}
                  checked={selectedCategories.includes(cat.id)}
                  onCheckedChange={(checked) => handleCategoryChange(cat.id, checked as boolean)}
                />
                <Label htmlFor={cat.id}>{cat.label}</Label>
              </div>
            ))}
          </div>
          <div className="pt-6">
            <Button onClick={saveCategories} disabled={updateCategoriesMutation.isPending}>
              {updateCategoriesMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Categorias
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documentos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {driver.DriverDocument?.map((doc: any) => (
              <Card key={doc.id}>
                <CardHeader className="p-4">
                  <CardTitle className="text-sm font-medium">{doc.documentType}</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="aspect-video relative bg-muted rounded-md overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={doc.documentUrl}
                      alt={doc.documentType}
                      className="object-cover w-full h-full"
                    />
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Status: {doc.isVerified ? 'Verificado' : 'Pendente'}
                  </div>
                </CardContent>
              </Card>
            ))}
            {(!driver.DriverDocument || driver.DriverDocument.length === 0) && (
                <div className="col-span-3 text-center text-muted-foreground py-8">
                    Nenhum documento enviado.
                </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
