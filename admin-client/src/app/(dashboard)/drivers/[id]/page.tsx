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
import { VehicleForm } from '@/components/drivers/vehicle-form';

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
      const authorized = driver.DriverRideType.map((dt: any) => dt.RideTypeConfig.type);
      if (authorized.length > 0) setSelectedCategories(authorized);
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

  const checkCompatibility = (category: { id: string; label: string }, vehicle: any) => {
    if (!vehicle) return { compatible: false, reason: 'Sem veículo' };

    switch (category.id) {
      case 'BLINDADO':
        if (!vehicle.isArmored) return { compatible: false, reason: 'Requer veículo blindado' };
        break;
      case 'EXECUTIVO':
        if (!vehicle.isLuxury) return { compatible: false, reason: 'Requer veículo de luxo' };
        break;
      case 'PET':
        if (!vehicle.isPetFriendly) return { compatible: false, reason: 'Requer veículo Pet Friendly' };
        break;
      case 'DELIVERY':
        if (!vehicle.deliveryCapable) return { compatible: false, reason: 'Requer habilitação para entregas' };
        break;
      case 'MOTO':
        if (!vehicle.isMotorcycle) return { compatible: false, reason: 'Requer motocicleta' };
        break;
      case 'MULHER':
        // Check driver gender if available
        if (driver.User.gender !== 'FEMALE') return { compatible: false, reason: 'Apenas motoristas mulheres' };
        break;
      case 'NORMAL':
        if (vehicle.isMotorcycle) return { compatible: false, reason: 'Motos usam categoria Moto' };
        break;
    }
    return { compatible: true };
  };

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
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="space-y-1">
              <CardTitle>Veículo</CardTitle>
              <CardDescription>
                  Status: {driver.Vehicle?.inspectionStatus || 'N/A'}
              </CardDescription>
            </div>
            <VehicleForm driverId={driver.id} vehicle={driver.Vehicle} />
          </CardHeader>
          <CardContent className="space-y-2">
            {driver.Vehicle ? (
              <>
                <div className="grid grid-cols-2 gap-4">
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
                </div>
                
                <div className="flex flex-wrap gap-2 mt-2">
                  {driver.Vehicle.isArmored && <Badge variant="secondary">Blindado</Badge>}
                  {driver.Vehicle.isLuxury && <Badge variant="secondary">Luxo</Badge>}
                  {driver.Vehicle.isPetFriendly && <Badge variant="secondary">Pet Friendly</Badge>}
                  {driver.Vehicle.deliveryCapable && <Badge variant="secondary">Entregas</Badge>}
                  {driver.Vehicle.isMotorcycle && <Badge variant="secondary">Moto</Badge>}
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
          <CardTitle>Categorias Autorizadas</CardTitle>
          <CardDescription>
            Selecione as categorias que este motorista está autorizado a fazer corridas.
            O motorista poderá ativar ou desativar essas categorias no aplicativo conforme sua preferência.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {availableCategories.map((cat) => {
              const isCompatible = checkCompatibility(cat, driver.Vehicle);
              const isAuthorized = selectedCategories.includes(cat.id);
              const driverType = driver.DriverRideType?.find((dt: any) => dt.RideTypeConfig.type === cat.id);
              const isActive = driverType?.isActive;

              return (
                <div key={cat.id} className="flex items-start space-x-2">
                  <Checkbox
                    id={cat.id}
                    checked={isAuthorized}
                    onCheckedChange={(checked) => handleCategoryChange(cat.id, checked as boolean)}
                    disabled={!isCompatible.compatible && !isAuthorized}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label
                      htmlFor={cat.id}
                      className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${
                        !isCompatible.compatible ? 'text-red-500' : ''
                      }`}
                    >
                      {cat.label}
                      {isAuthorized && isActive !== undefined && (
                        <span className={`ml-2 text-xs ${isActive ? 'text-green-600' : 'text-gray-400'}`}>
                          {isActive ? '(ativa)' : '(inativa)'}
                        </span>
                      )}
                    </Label>
                    {!isCompatible.compatible && (
                      <p className="text-xs text-red-500">
                        {isCompatible.reason}
                      </p>
                    )}
                    {isAuthorized && !isCompatible.compatible && (
                      <p className="text-xs text-amber-600">
                        Categoria autorizada mas veículo incompatível
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="pt-6 space-y-2">
            <Button onClick={saveCategories} disabled={updateCategoriesMutation.isPending}>
              {updateCategoriesMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Categorias Autorizadas
            </Button>
            <p className="text-xs text-muted-foreground">
              Categorias autorizadas podem ser ativadas/desativadas pelo motorista no app.
              O status (ativa/inativa) indica a escolha atual do motorista.
            </p>
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
