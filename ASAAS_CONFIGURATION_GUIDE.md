# 🚀 Guia Completo de Configuração ASAAS

## 📋 Índice
1. [Criação de Conta](#1-criação-de-conta)
2. [Configuração da API](#2-configuração-da-api)
3. [Configuração de Webhooks](#3-configuração-de-webhooks)
4. [Configuração de Métodos de Pagamento](#4-configuração-de-métodos-de-pagamento)
5. [Testes em Sandbox](#5-testes-em-sandbox)
6. [Migração para Produção](#6-migração-para-produção)
7. [Monitoramento](#7-monitoramento)

---

## 1. Criação de Conta

### Passo 1.1: Acessar o ASAAS
1. Acesse [https://www.asaas.com/](https://www.asaas.com/)
2. Clique em **"Abrir minha conta"**
3. Preencha os dados da sua empresa:
   - Nome da empresa
   - CNPJ
   - Email
   - Telefone
   - Senha

### Passo 1.2: Verificação de Email
1. Acesse o email cadastrado
2. Clique no link de verificação
3. Confirme seu email

### Passo 1.3: Completar Cadastro
1. Faça login no painel ASAAS
2. Complete as informações da empresa:
   - Endereço completo
   - Tipo de negócio
   - Faturamento estimado
3. Envie os documentos solicitados:
   - Contrato Social
   - Documentos dos sócios
   - Comprovante de endereço

---

## 2. Configuração da API

### Passo 2.1: Ativar Modo Sandbox
Para testes, use o ambiente Sandbox:

1. No painel, vá em **Configurações** → **Integrações**
2. Ative o **Modo Sandbox**
3. Copie a **Chave API Sandbox**

```
Exemplo de Chave Sandbox:
$aact_hmlg_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZtNGZhZGY6OjViOTRlMzYyLWMxZDMtNGZjOS04MmYxLTM3NmUyNDJjMzVhODo6JGFhY2hfOWVmMTAzOTMtMjc0ZS00YjEyLWFiZmYtMDFjMmY0NzE4Nzgz
```

### Passo 2.2: Configurar no Backend

Adicione no Railway (ou seu ambiente):

```env
ASAAS_API_KEY=$aact_hmlg_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZtNGZhZGY6OjViOTRlMzYyLWMxZDMtNGZjOS04MmYxLTM3NmUyNDJjMzVhODo6JGFhY2hfOWVmMTAzOTMtMjc0ZS00YjEyLWFiZmYtMDFjMmY0NzE4Nzgz
ASAAS_WALLET_ID=71e86220-6227-41d9-a4ce-07a19eba46ec
```

### Passo 2.3: Testar Conexão

```bash
curl -H "access_token: $aact_hmlg_..." \
  https://sandbox.asaas.com/api/v3/customers
```

Resposta esperada:
```json
{
  "object": "list",
  "hasMore": false,
  "totalCount": 0,
  "limit": 10,
  "offset": 0,
  "data": []
}
```

---

## 3. Configuração de Webhooks

Os webhooks são essenciais para confirmar pagamentos automaticamente.

### Passo 3.1: Acessar Webhooks
1. No painel ASAAS, vá em **Configurações** → **Integrações** → **Webhooks**
2. Clique em **"Adicionar Webhook"**

### Passo 3.2: Configurar URL
Configure a URL do seu backend:

**Sandbox:**
```
https://api.jhaguar.com/asaas/webhook
```

**Produção:**
```
https://api.jhaguar.com/asaas/webhook
```

### Passo 3.3: Selecionar Eventos

Marque os seguintes eventos:

#### ✅ Eventos de Pagamento (OBRIGATÓRIOS)
- [x] **PAYMENT_CREATED** - Cobrança criada
- [x] **PAYMENT_UPDATED** - Cobrança atualizada
- [x] **PAYMENT_CONFIRMED** - Pagamento confirmado
- [x] **PAYMENT_RECEIVED** - Pagamento recebido
- [x] **PAYMENT_OVERDUE** - Pagamento vencido
- [x] **PAYMENT_DELETED** - Cobrança deletada
- [x] **PAYMENT_REFUNDED** - Pagamento reembolsado

#### ❌ Eventos NÃO Necessários (desmarque)
- [ ] Eventos de assinatura recorrente
- [ ] Eventos de split
- [ ] Eventos de transferência

### Passo 3.4: Autenticação (Opcional mas Recomendado)

Para maior segurança, você pode adicionar um token de autenticação:

1. Gere um token seguro:
```bash
openssl rand -hex 32
```

2. Adicione no ASAAS como **"Token de Autenticação"**

3. Configure no backend:
```env
ASAAS_WEBHOOK_TOKEN=seu_token_aqui
```

4. No código, valide o token:
```typescript
@Post('webhook')
async handleWebhook(
  @Headers('asaas-access-token') token: string,
  @Body() event: AsaasWebhookEvent
) {
  if (token !== process.env.ASAAS_WEBHOOK_TOKEN) {
    throw new UnauthorizedException('Token inválido');
  }
  // ... processar webhook
}
```

### Passo 3.5: Testar Webhook

No painel ASAAS:
1. Vá em **Webhooks** → **Logs**
2. Clique em **"Enviar Teste"**
3. Verifique se o endpoint respondeu com `200 OK`

---

## 4. Configuração de Métodos de Pagamento

### Passo 4.1: PIX

O PIX vem ativado por padrão no ASAAS.

**Verificar:**
1. Vá em **Configurações** → **Formas de Recebimento**
2. Confirme que **PIX** está ativo
3. Configure o **Limite de Recebimento** (se necessário)

**Taxa do ASAAS:**
- R$ 0,00 (sem taxas para PIX)

### Passo 4.2: Cartão de Crédito

**Ativação:**
1. Vá em **Configurações** → **Formas de Recebimento**
2. Clique em **"Ativar Cartão de Crédito"**
3. Preencha os dados solicitados:
   - Dados bancários para recebimento
   - Documentos da empresa
   - Faturamento estimado

**Taxa do ASAAS:**
- 3,99% + R$ 0,39 por transação (débito)
- 4,99% + R$ 0,39 por transação (crédito à vista)

**Prazo de Aprovação:**
- 1-3 dias úteis (Sandbox: imediato)

### Passo 4.3: Boleto (DESATIVADO no seu projeto)

Para desativar:
1. Vá em **Configurações** → **Formas de Recebimento**
2. Desative **Boleto Bancário**

---

## 5. Testes em Sandbox

### Passo 5.1: Dados de Teste

**Cartões de Teste:**

| Número | Bandeira | Resultado |
|--------|----------|-----------|
| 5162306219378829 | Mastercard | Aprovado |
| 5161325853466612 | Mastercard | Negado |
| 4111111111111111 | Visa | Aprovado |
| 4000000000000002 | Visa | Negado |

**CPF de Teste:**
```
123.456.789-09
```

**CEP de Teste:**
```
01310-100
```

### Passo 5.2: Testar PIX

1. Crie uma cobrança PIX via API
2. O QR Code será gerado instantaneamente
3. Em Sandbox, o pagamento é confirmado automaticamente após 5 segundos

**Simular Pagamento PIX:**
```bash
# O ASAAS simula automaticamente em Sandbox
# Aguarde 5 segundos e o webhook será enviado
```

### Passo 5.3: Testar Cartão de Crédito

```bash
POST /subscriptions/purchase
{
  "planId": "plan-uuid",
  "billingType": "CREDIT_CARD"
}

# Depois:
POST /asaas/pay-credit-card
{
  "chargeId": "pay_xxx",
  "creditCard": {
    "cardNumber": "5162306219378829",
    "holderName": "TESTE SILVA",
    "expiryMonth": "12",
    "expiryYear": "2028",
    "cvv": "123",
    "cpfCnpj": "12345678909",
    "postalCode": "01310100",
    "addressNumber": "1000",
    "phone": "11999999999"
  }
}
```

### Passo 5.4: Verificar Logs

No painel ASAAS:
1. **Cobranças** → Ver todas as cobranças de teste
2. **Webhooks** → Ver logs de webhooks enviados
3. **Transações** → Ver detalhes de cada transação

---

## 6. Migração para Produção

### Passo 6.1: Aprovação da Conta

Aguarde a aprovação da sua conta (1-5 dias úteis).

Você receberá um email com:
- ✅ Conta aprovada
- ✅ Chave API de Produção

### Passo 6.2: Obter Chave de Produção

1. Faça login no painel ASAAS
2. Desative o **Modo Sandbox**
3. Vá em **Configurações** → **Integrações**
4. Copie a **Chave API de Produção**

```
Exemplo:
$aact_prod_9b2f6d4e8c1a5f3e7d0b9a8c6e5d4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7
```

### Passo 6.3: Atualizar Backend

No Railway ou seu ambiente de produção:

```env
# Substituir chave Sandbox por Produção
ASAAS_API_KEY=$aact_prod_9b2f6d4e8c1a5f3e7d0b9a8c6e5d4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7
```

O sistema detecta automaticamente se está em produção pela chave.

### Passo 6.4: Reconfigurar Webhooks

Repita o Passo 3 com a URL de produção.

### Passo 6.5: Teste em Produção

Faça um teste real com valor baixo (R$ 5,00):
1. Crie uma cobrança de teste
2. Pague com PIX ou cartão real
3. Verifique se o webhook chegou
4. Confirme ativação da assinatura

---

## 7. Monitoramento

### Passo 7.1: Dashboard ASAAS

Monitore diariamente:
- **Cobranças**: Total, pagas, pendentes, vencidas
- **Taxa de Conversão**: % de pagamentos bem-sucedidos
- **Webhooks**: Taxa de sucesso de envio

### Passo 7.2: Logs do Backend

Verifique os logs do Railway:

```bash
railway logs --follow | grep ASAAS
```

Mensagens importantes:
```
✅ AsaasService iniciado - Modo: SANDBOX
✅ Cliente ASAAS criado: cus_xxx
✅ Cobrança ASAAS criada: pay_xxx
✅ QR Code PIX gerado
✅ Webhook recebido: PAYMENT_CONFIRMED
✅ Plano ativado via webhook
```

### Passo 7.3: Alertas

Configure alertas para:
- ❌ Taxa de erro > 5%
- ❌ Webhook falhando
- ❌ Pagamento recusado (cartão)
- ❌ Tempo de resposta > 3s

### Passo 7.4: Relatórios

Gere relatórios semanais:
- Número de assinaturas vendidas
- Método de pagamento mais usado
- Taxa de sucesso por método
- Receita total

---

## 🎯 Checklist Final

Antes de colocar em produção:

- [ ] Conta ASAAS aprovada
- [ ] Chave API de produção configurada
- [ ] Webhooks configurados e testados
- [ ] PIX ativado e testado
- [ ] Cartão de crédito ativado e testado
- [ ] Teste real de pagamento realizado
- [ ] Logs monitorados
- [ ] Frontend integrado e testado
- [ ] Fluxo completo revisado

---

## 📞 Suporte

**ASAAS:**
- Email: suporte@asaas.com
- Telefone: (11) 4000-0200
- Chat: Disponível no painel

**Documentação:**
- [Docs Oficiais](https://docs.asaas.com/)
- [API Reference](https://docs.asaas.com/reference)
- [FAQ](https://ajuda.asaas.com/)

---

**Configuração Completa** ✅
**Pronto para Produção** 🚀
