# Exemplos de Uso da API ASAAS

## 1. Comprar Assinatura (PIX)

### Request
```http
POST /subscriptions/purchase
Content-Type: application/json
Authorization: Bearer <jwt_token>

{
  "planId": "plan-uuid-here",
  "billingType": "PIX"
}
```

### Response Success
```json
{
  "subscriptionId": "sub_123456",
  "chargeId": "pay_abc123",
  "amount": 50.0,
  "planName": "Plano Semanal",
  "billingType": "PIX",
  "status": "PENDING",
  "pixQrCode": {
    "encodedImage": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "payload": "00020126580014br.gov.bcb.pix...",
    "expirationDate": "2024-03-25T12:00:00.000Z"
  }
}
```

## 2. Comprar Assinatura (Boleto)

### Request
```http
POST /subscriptions/purchase
Content-Type: application/json
Authorization: Bearer <jwt_token>

{
  "planId": "plan-uuid-here",
  "billingType": "BOLETO"
}
```

### Response Success
```json
{
  "subscriptionId": "sub_123456",
  "chargeId": "pay_abc123",
  "amount": 50.0,
  "planName": "Plano Semanal",
  "billingType": "BOLETO",
  "status": "PENDING",
  "invoiceUrl": "https://www.asaas.com/i/abc123",
  "bankSlipUrl": "https://www.asaas.com/b/abc123"
}
```

## 3. Comprar Assinatura (Cartão de Crédito)

### Request
```http
POST /subscriptions/purchase
Content-Type: application/json
Authorization: Bearer <jwt_token>

{
  "planId": "plan-uuid-here",
  "billingType": "CREDIT_CARD"
}
```

### Response Success
```json
{
  "subscriptionId": "sub_123456",
  "chargeId": "pay_abc123",
  "amount": 50.0,
  "planName": "Plano Semanal",
  "billingType": "CREDIT_CARD",
  "status": "PENDING",
  "invoiceUrl": "https://www.asaas.com/i/abc123"
}
```

**Nota**: Para cartão de crédito, o frontend precisará coletar os dados do cartão e enviar para o ASAAS diretamente (tokenização).

## 4. Verificar Status da Assinatura

### Request
```http
GET /subscriptions/current
Authorization: Bearer <jwt_token>
```

### Response - Assinatura Ativa
```json
{
  "hasActiveSubscription": true,
  "subscription": {
    "id": "sub_123456",
    "status": "ACTIVE",
    "startDate": "2024-03-24T10:00:00.000Z",
    "endDate": "2024-03-31T10:00:00.000Z",
    "plan": {
      "id": "plan_uuid",
      "name": "Plano Semanal",
      "type": "WEEKLY",
      "price": 50.0,
      "durationDays": 7
    }
  }
}
```

### Response - Sem Assinatura
```json
{
  "hasActiveSubscription": false,
  "subscription": null
}
```

## 5. Listar Planos Disponíveis

### Request
```http
GET /subscriptions/plans
Authorization: Bearer <jwt_token>
```

### Response
```json
[
  {
    "id": "plan_weekly_uuid",
    "type": "WEEKLY",
    "name": "Plano Semanal",
    "description": "Acesso por 7 dias",
    "price": 50.0,
    "durationDays": 7,
    "isActive": true
  },
  {
    "id": "plan_monthly_uuid",
    "type": "MONTHLY",
    "name": "Plano Mensal",
    "description": "Acesso por 30 dias",
    "price": 150.0,
    "durationDays": 30,
    "isActive": true
  }
]
```

## 6. Webhook do ASAAS

### Evento: PAYMENT_RECEIVED

```json
{
  "event": "PAYMENT_RECEIVED",
  "payment": {
    "id": "pay_abc123",
    "customer": "cus_xyz789",
    "value": 50.0,
    "netValue": 47.5,
    "billingType": "PIX",
    "status": "RECEIVED",
    "dueDate": "2024-03-25",
    "paymentDate": "2024-03-24",
    "clientPaymentDate": "2024-03-24",
    "externalReference": "driver_123_plan_456"
  }
}
```

### Evento: PAYMENT_CONFIRMED

```json
{
  "event": "PAYMENT_CONFIRMED",
  "payment": {
    "id": "pay_abc123",
    "customer": "cus_xyz789",
    "value": 50.0,
    "netValue": 47.5,
    "billingType": "PIX",
    "status": "CONFIRMED",
    "dueDate": "2024-03-25",
    "paymentDate": "2024-03-24",
    "clientPaymentDate": "2024-03-24",
    "externalReference": "driver_123_plan_456"
  }
}
```

## Códigos de Status ASAAS

- `PENDING`: Aguardando pagamento
- `RECEIVED`: Pagamento recebido (PIX)
- `CONFIRMED`: Pagamento confirmado
- `OVERDUE`: Vencido
- `REFUNDED`: Reembolsado

## Integração com Frontend React Native

### Exemplo de Tela de Pagamento

```typescript
import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { api } from '@/lib/api';

export function SubscriptionPurchaseScreen({ planId, planName, amount }) {
  const [loading, setLoading] = useState(false);
  const [pixQrCode, setPixQrCode] = useState(null);
  const [paymentUrl, setPaymentUrl] = useState(null);

  const handlePurchase = async (billingType: 'PIX' | 'BOLETO') => {
    setLoading(true);
    try {
      const response = await api.post('/subscriptions/purchase', {
        planId,
        billingType,
      });

      if (billingType === 'PIX') {
        setPixQrCode(response.data.pixQrCode);
      } else {
        setPaymentUrl(response.data.bankSlipUrl);
      }
    } catch (error) {
      console.error('Erro ao comprar plano:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <Text>{planName} - R$ {amount}</Text>

      <TouchableOpacity onPress={() => handlePurchase('PIX')}>
        <Text>Pagar com PIX</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => handlePurchase('BOLETO')}>
        <Text>Pagar com Boleto</Text>
      </TouchableOpacity>

      {pixQrCode && (
        <View>
          <Image source={{ uri: pixQrCode.encodedImage }} />
          <Text>Copie o código PIX ou escaneie o QR Code</Text>
          <Text>{pixQrCode.payload}</Text>
        </View>
      )}

      {paymentUrl && (
        <TouchableOpacity onPress={() => Linking.openURL(paymentUrl)}>
          <Text>Abrir Boleto</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
```

## Configuração no ASAAS

1. Acesse https://www.asaas.com/
2. Faça login na sua conta
3. Vá em **Configurações > Webhooks**
4. Adicione a URL: `https://api.jhaguar.com/asaas/webhook`
5. Selecione os eventos:
   - ✅ PAYMENT_RECEIVED
   - ✅ PAYMENT_CONFIRMED
   - ✅ PAYMENT_OVERDUE
   - ✅ PAYMENT_DELETED

## Testando em Sandbox

Use a chave de API sandbox fornecida:
```
$aact_hmlg_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZtNGZhZGY6OjViOTRlMzYyLWMxZDMtNGZjOS04MmYxLTM3NmUyNDJjMzVhODo6JGFhY2hfOWVmMTAzOTMtMjc0ZS00YjEyLWFiZmYtMDFjMmY0NzE4Nzgz
```

Para simular pagamentos em sandbox, use os cartões de teste disponíveis na [documentação do ASAAS](https://docs.asaas.com/docs/como-simular-pagamentos).

---

**Implementado com Clean Code** ✨
