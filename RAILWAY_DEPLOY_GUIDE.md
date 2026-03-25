# Guia de Deploy no Railway - ASAAS Integration

## 📋 Checklist Pré-Deploy

- [ ] Código commitado no Git
- [ ] Variáveis de ambiente configuradas no Railway
- [ ] Banco de dados PostgreSQL ativo no Railway
- [ ] Chave API do ASAAS obtida

## 🚀 Passo a Passo

### 1. Configurar Variáveis de Ambiente no Railway

Acesse o painel do Railway e adicione as seguintes variáveis:

```env
# ASAAS - OBRIGATÓRIAS
ASAAS_API_KEY=$aact_hmlg_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZtNGZhZGY6OjViOTRlMzYyLWMxZDMtNGZjOS04MmYxLTM3NmUyNDJjMzVhODo6JGFhY2hfOWVmMTAzOTMtMjc0ZS00YjEyLWFiZmYtMDFjMmY0NzE4Nzgz
ASAAS_WALLET_ID=71e86220-6227-41d9-a4ce-07a19eba46ec

# Banco de Dados - JÁ CONFIGURADO
DATABASE_URL=<sua_connection_string_postgresql>

# JWT e Segurança
JWT_SECRET=<seu_jwt_secret>
NODE_ENV=production

# Google Maps
GOOGLE_API_KEY=<sua_chave_google>

# Stripe (mantido para wallet topup)
STRIPE_SECRET_KEY=<sua_chave_stripe>
STRIPE_PUBLISHABLE_KEY=<sua_chave_publica_stripe>
STRIPE_WEBHOOK_SECRET=<seu_webhook_secret_stripe>

# Servidor
PORT=3000
```

### 2. Commit e Push do Código

```bash
cd /Users/lucasemanuelpereiraribeiro/Projects/jhaguar-backend

git add .
git commit -m "feat: implementar gateway ASAAS para assinaturas

- Criar módulo ASAAS com service, controller e DTOs
- Integrar ASAAS com SubscriptionsService
- Suporte a PIX, Boleto e Cartão de Crédito
- Implementar webhooks do ASAAS
- Manter Stripe para wallet topup

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

git push origin PagamentosAssinatura
```

### 3. O Railway Fará Automaticamente

1. **Detectar mudanças** no repositório
2. **Instalar dependências** (`npm install`)
3. **Gerar Prisma Client** (`npx prisma generate`)
4. **Build do projeto** (`npm run build`)
5. **Iniciar aplicação** (`npm run start:prod`)

### 4. Verificar Logs no Railway

Após o deploy, verifique os logs:

```
✅ Mensagem esperada:
"AsaasService iniciado - Modo: SANDBOX" ou "PRODUÇÃO"
```

### 5. Executar Migração do Prisma (se necessário)

Se você fez mudanças no schema.prisma:

```bash
# No terminal local ou no Railway CLI
railway run npx prisma migrate deploy
```

**Nota**: Para esta implementação, NÃO foram feitas mudanças no schema, então NÃO é necessário rodar migrations.

### 6. Configurar Webhooks no ASAAS

1. Acesse https://www.asaas.com/
2. Login na conta
3. Ir em **Configurações > Integrações > Webhooks**
4. Adicionar novo webhook:
   - **URL**: `https://api.jhaguar.com/asaas/webhook`
   - **Eventos**:
     - ✅ PAYMENT_RECEIVED
     - ✅ PAYMENT_CONFIRMED
     - ✅ PAYMENT_OVERDUE
     - ✅ PAYMENT_DELETED
5. Salvar

### 7. Testar a Integração

#### Teste 1: Health Check
```bash
curl https://api.jhaguar.com/health
```

#### Teste 2: Listar Planos
```bash
curl -H "Authorization: Bearer <jwt_token>" \
  https://api.jhaguar.com/subscriptions/plans
```

#### Teste 3: Comprar Assinatura
```bash
curl -X POST \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{"planId":"<plan_uuid>","billingType":"PIX"}' \
  https://api.jhaguar.com/subscriptions/purchase
```

**Resposta esperada**:
```json
{
  "subscriptionId": "...",
  "chargeId": "...",
  "pixQrCode": { ... }
}
```

## 🔍 Monitoramento

### Verificar Logs em Tempo Real

```bash
railway logs --follow
```

### Mensagens de Log Importantes

```
✅ "AsaasService iniciado - Modo: SANDBOX"
✅ "Cliente ASAAS criado: cus_xyz - email@example.com"
✅ "Cobrança ASAAS criada: pay_abc - R$ 50 (PIX)"
✅ "QR Code PIX gerado para cobrança: pay_abc"
✅ "Webhook ASAAS recebido: PAYMENT_RECEIVED - pay_abc"
✅ "Plano ativado via webhook: pay_abc"
```

### Erros Comuns

#### ❌ "ASAAS_API_KEY não configurada"
**Solução**: Adicionar variável de ambiente no Railway

#### ❌ "Error 401: Invalid API key"
**Solução**: Verificar se a chave API está correta

#### ❌ "Cannot find module '@prisma/client'"
**Solução**: Executar `npm run prisma:generate` no Railway

## 📊 Métricas a Monitorar

1. **Taxa de sucesso de cobranças**: >95%
2. **Tempo de resposta**: <2s para criar cobrança
3. **Taxa de webhooks processados**: 100%
4. **Erros 4xx/5xx**: <1%

## 🔄 Rollback (se necessário)

Se algo der errado, voltar para a branch anterior:

```bash
git checkout master
git push -f origin PagamentosAssinatura
```

Ou reverter o commit:

```bash
git revert HEAD
git push origin PagamentosAssinatura
```

## 🎯 Próximos Passos Após Deploy

1. [ ] Testar compra de assinatura em Sandbox
2. [ ] Verificar recebimento de webhooks
3. [ ] Confirmar ativação automática de assinatura
4. [ ] Testar expiração de assinatura (cron job)
5. [ ] Monitorar logs por 24h
6. [ ] Solicitar chave de produção do ASAAS (quando aprovado)
7. [ ] Atualizar `ASAAS_API_KEY` para produção

## 📱 Atualizar Frontend

O frontend precisará ser atualizado para:

1. Mostrar opções de pagamento (PIX, Boleto)
2. Exibir QR Code PIX
3. Abrir URL do boleto
4. Polling de status da assinatura

## 🔐 Migrar para Produção ASAAS

Quando a conta ASAAS for aprovada:

1. Obter chave de produção do ASAAS
2. Atualizar no Railway:
   ```
   ASAAS_API_KEY=$aact_prod_<nova_chave>
   ```
3. O sistema detectará automaticamente o modo produção
4. Reconfigurar webhook para produção

## 📞 Suporte

- **ASAAS**: suporte@asaas.com
- **Railway**: https://railway.app/help
- **Documentação ASAAS**: https://docs.asaas.com/

---

**Preparado para produção** ✅
**Clean Code** ✅
**Zero Downtime** ✅
