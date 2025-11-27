'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Search, Eye } from 'lucide-react';
import api from '@/lib/api';

type Status = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export default function DriversPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<Status | 'ALL'>('ALL');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['drivers', page, status, search],
    queryFn: async () => {
      const params: any = { page, limit: 10 };
      if (status !== 'ALL') params.status = status;
      if (search) params.search = search;
      const response = await api.get('/admin/drivers', { params });
      return response.data;
    },
  });

  const getStatusBadge = (status: Status) => {
    switch (status) {
      case 'APPROVED':
        return <Badge className="bg-green-500">Aprovado</Badge>;
      case 'PENDING':
        return <Badge className="bg-yellow-500">Pendente</Badge>;
      case 'REJECTED':
        return <Badge className="bg-red-500">Rejeitado</Badge>;
      case 'SUSPENDED':
        return <Badge className="bg-gray-500">Suspenso</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Motoristas</h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou email..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Tabs value={status} onValueChange={(v) => setStatus(v as any)}>
          <TabsList>
            <TabsTrigger value="ALL">Todos</TabsTrigger>
            <TabsTrigger value="PENDING">Pendentes</TabsTrigger>
            <TabsTrigger value="APPROVED">Aprovados</TabsTrigger>
            <TabsTrigger value="REJECTED">Rejeitados</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Motorista</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Veículo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                </TableCell>
              </TableRow>
            ) : data?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  Nenhum motorista encontrado.
                </TableCell>
              </TableRow>
            ) : (
              data?.data.map((driver: any) => (
                <TableRow key={driver.id}>
                  <TableCell className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={driver.User.profileImage} />
                      <AvatarFallback>{driver.User.firstName[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">
                        {driver.User.firstName} {driver.User.lastName}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{driver.User.email}</TableCell>
                  <TableCell>{driver.User.phone}</TableCell>
                  <TableCell>
                    {driver.Vehicle ? (
                      <span>
                        {driver.Vehicle.make} {driver.Vehicle.model} ({driver.Vehicle.licensePlate})
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Sem veículo</span>
                    )}
                  </TableCell>
                  <TableCell>{getStatusBadge(driver.accountStatus)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => router.push(`/drivers/${driver.id}`)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1 || isLoading}
        >
          Anterior
        </Button>
        <span className="text-sm text-muted-foreground">
          Página {page} de {data?.meta.totalPages || 1}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => p + 1)}
          disabled={page >= (data?.meta.totalPages || 1) || isLoading}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}
