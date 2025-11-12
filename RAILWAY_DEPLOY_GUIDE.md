# 🚂 Guia de Deploy no Railway - Jhaguar Backend

## 📋 Índice
- [Pré-requisitos](#pré-requisitos)
- [Configuração do Projeto no Railway](#configuração-do-projeto-no-railway)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Deploy da Aplicação](#deploy-da-aplicação)
- [Verificação e Troubleshooting](#verificação-e-troubleshooting)
- [Manutenção e Monitoramento](#manutenção-e-monitoramento)

---

## 🎯 Pré-requisitos

### Contas Necessárias
- ✅ Conta no [Railway.app](https://railway.app)
- ✅ Repositório Git (GitHub, GitLab ou Bitbucket)
- ✅ Domínio personalizado (opcional): `api.jhaguar.com`

### Serviços Necessários
1. **PostgreSQL Database** (provisionado pelo Railway)
2. **Redis** (provisionado pelo Railway)
3. **Backend Application** (este projeto)

---

## 🔧 Configuração do Projeto no Railway

### Passo 1: Criar Novo Projeto

1. Acesse [Railway.app](https://railway.app)
2. Clique em **"New Project"**
3. Selecione **"Empty Project"**
4. Nomeie o projeto: `jhaguar-production`

### Passo 2: Adicionar PostgreSQL

1. Clique em **"+ New"** → **"Database"** → **"Add PostgreSQL"**
2. Aguarde o provisionamento (1-2 minutos)
3. A variável `DATABASE_URL` será gerada automaticamente

### Passo 3: Adicionar Redis

1. Clique em **"+ New"** → **"Database"** → **"Add Redis"**
2. Aguarde o provisionamento
3. A variável `REDIS_URL` será gerada automaticamente

### Passo 4: Adicionar Backend Application

1. Clique em **"+ New"** → **"GitHub Repo"**
2. Conecte seu repositório GitHub
3. Selecione o repositório `jhaguar-backend`
4. Selecione a branch: `main` ou `master`

---

## 🔐 Variáveis de Ambiente

### Configurar Variáveis no Railway

1. Clique no serviço **Backend**
2. Vá para a aba **"Variables"**
3. Adicione as seguintes variáveis:

#### Variáveis Essenciais

```bash
# Ambiente
NODE_ENV=production

# Porta (Railway define automaticamente, mas pode especificar)
PORT=3000

# Banco de Dados (gerado automaticamente pelo Railway)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Redis (gerado automaticamente pelo Railway)
REDIS_URL=${{Redis.REDIS_URL}}

# JWT
JWT_SECRET=seu-jwt-secret-super-seguro-aqui-com-pelo-menos-32-caracteres

# Google Maps API
GOOGLE_API_KEY=sua-chave-do-google-maps-api
EXPO_PUBLIC_GOOGLE_API_KEY=sua-chave-do-google-maps-api

# Stripe (Produção)
STRIPE_SECRET_KEY=sk_live_sua-chave-secreta-do-stripe
STRIPE_PUBLISHABLE_KEY=pk_live_sua-chave-publicavel-do-stripe
STRIPE_WEBHOOK_SECRET=whsec_sua-chave-de-webhook-do-stripe

# URL do Servidor (seu domínio)
EXPO_PUBLIC_SERVER_URL=https://api.jhaguar.com
```

### ⚠️ Importante - Referências entre Serviços

Railway permite referenciar variáveis de outros serviços usando a sintaxe:
```
${{ServiceName.VARIABLE_NAME}}
```

Exemplo:
```bash
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
```

---

## 🚀 Deploy da Aplicação

### Método 1: Deploy Automático (Recomendado)

1. **Push para o repositório:**
   ```bash
   cd /Users/lucasemanuelpereiraribeiro/Projects/jhaguar-backend
   git add .
   git commit -m "feat: melhorar sistema de migrations para produção"
   git push origin main
   ```

2. **Railway detecta mudanças e inicia build automaticamente**

3. **Acompanhe o deploy:**
   - Acesse a aba **"Deployments"** no Railway
   - Clique no deployment em andamento
   - Visualize os logs em tempo real

### Método 2: Deploy Manual

1. No Railway, vá para o serviço Backend
2. Clique em **"Settings"**
3. Role até **"Deployment"**
4. Clique em **"Redeploy"**

---

## ✅ Verificação e Troubleshooting

### Verificar Logs do Deploy

1. No Railway, acesse o serviço **Backend**
2. Clique na aba **"Deployments"**
3. Selecione o último deployment
4. Visualize os logs

### Logs Esperados (Sucesso)

```
╔════════════════════════════════════════════════════════╗
║        🐆 JHAGUAR BACKEND - STARTING UP 🐆            ║
╚════════════════════════════════════════════════════════╝

📍 Ambiente: production
🔌 Porta: 3000
🗄️  Banco de dados configurado

🔧 Executando verificação de migrations...

╔════════════════════════════════════════════════════════╗
║   🔧 JHAGUAR BACKEND - MIGRATION CHECK & DEPLOY 🔧    ║
╚════════════════════════════════════════════════════════╝

🔍 Verificando conexão com o banco de dados...
✅ Conexão com banco de dados estabelecida!

📋 Verificando status das migrations...
✅ Todas as migrations já foram aplicadas

⚙️  Gerando Prisma Client...
✅ Prisma Client gerado com sucesso!

🔍 Verificando se as tabelas foram criadas...
✅ Tabela "User" encontrada no banco de dados!

╔════════════════════════════════════════════════════════╗
║              ✅ PROCESSO CONCLUÍDO COM SUCESSO! ✅      ║
╚════════════════════════════════════════════════════════╝

╔════════════════════════════════════════════════════════╗
║           🚀 INICIANDO APLICAÇÃO... 🚀                ║
╚════════════════════════════════════════════════════════╝

🚀 Aplicação rodando em: http://localhost:3000
📚 Documentação da API: http://localhost:3000/api-docs
```

### Erros Comuns e Soluções

#### ❌ Erro: "DATABASE_URL não está definida"

**Causa:** Variável de ambiente não configurada

**Solução:**
1. Vá para **Variables** no Railway
2. Adicione: `DATABASE_URL=${{Postgres.DATABASE_URL}}`
3. Salve e faça redeploy

#### ❌ Erro: "The table public.User does not exist"

**Causa:** Migrations não foram aplicadas

**Solução:**
1. Verifique os logs do container
2. O script `check-and-migrate.js` deve executar automaticamente
3. Se falhar, execute migration manual (veja seção abaixo)

#### ❌ Erro: "Não foi possível conectar ao banco de dados"

**Causa:** PostgreSQL não está acessível

**Solução:**
1. Verifique se o serviço PostgreSQL está rodando no Railway
2. Verifique se `DATABASE_URL` está correta
3. Aguarde 1-2 minutos (Railway pode estar iniciando o banco)

---

## 🔨 Comandos de Manutenção

### Executar Migrations Manualmente

Se precisar aplicar migrations manualmente:

1. **Via Railway CLI:**
   ```bash
   # Instalar Railway CLI
   npm i -g @railway/cli

   # Fazer login
   railway login

   # Conectar ao projeto
   railway link

   # Executar shell no container
   railway run bash

   # Dentro do container, executar:
   node scripts/check-and-migrate.js
   ```

2. **Via Logs do Railway:**
   - O script é executado automaticamente na inicialização
   - Verifique os logs para ver o resultado

### Verificar Estado do Banco de Dados

```bash
# Via Railway CLI
railway run npx prisma migrate status

# Verificar tabelas
railway run npx prisma db execute --stdin <<< "SELECT tablename FROM pg_tables WHERE schemaname = 'public';"
```

### Resetar Banco de Dados (⚠️ CUIDADO - Apaga todos os dados!)

```bash
# APENAS EM DESENVOLVIMENTO/STAGING
railway run npx prisma migrate reset --force
```

---

## 🌐 Configurar Domínio Personalizado

### Passo 1: Adicionar Domínio no Railway

1. Clique no serviço **Backend**
2. Vá para a aba **"Settings"**
3. Role até **"Domains"**
4. Clique em **"Custom Domain"**
5. Digite: `api.jhaguar.com`
6. Clique em **"Add Domain"**

### Passo 2: Configurar DNS

Railway fornecerá um registro CNAME. Configure em seu provedor de DNS:

```
Tipo: CNAME
Nome: api
Valor: [fornecido-pelo-railway].up.railway.app
TTL: 3600 (ou automático)
```

### Passo 3: Aguardar Propagação

- Propagação DNS: 5 minutos a 48 horas
- Certificado SSL: Gerado automaticamente pelo Railway (Let's Encrypt)
- Verificar: `https://api.jhaguar.com/api-docs`

---

## 📊 Monitoramento

### Métricas Disponíveis no Railway

1. **CPU Usage**: Uso de CPU do container
2. **Memory Usage**: Uso de memória RAM
3. **Network**: Tráfego de entrada/saída
4. **Deployments**: Histórico de deployments

### Configurar Alertas (Railway Pro)

1. Vá para **Project Settings**
2. Clique em **"Notifications"**
3. Configure webhooks ou integrações com Slack/Discord

### Logs em Tempo Real

```bash
# Via Railway CLI
railway logs

# Filtrar por serviço
railway logs --service backend
```

---

## 🔄 CI/CD - Integração Contínua

### Deploy Automático Configurado

Railway já configura CI/CD automaticamente:
- ✅ Push para `main` → Deploy automático
- ✅ Build da imagem Docker
- ✅ Health checks
- ✅ Rollback automático em falhas

### Configurar Deploy Preview (Branches)

1. Vá para **Settings** do serviço Backend
2. Clique em **"Deploy Triggers"**
3. Ative **"Enable PR Deploys"**
4. Cada Pull Request terá um ambiente temporário

---

## 📝 Checklist de Produção

Antes de ir para produção, verifique:

- [ ] Todas as variáveis de ambiente configuradas
- [ ] `NODE_ENV=production`
- [ ] Chaves do Stripe são de **produção** (não test)
- [ ] JWT_SECRET é forte e seguro
- [ ] Domínio personalizado configurado
- [ ] SSL ativo (verificar https://)
- [ ] Migrations aplicadas com sucesso
- [ ] Teste de autenticação funcionando
- [ ] Teste de criação de corrida funcionando
- [ ] WebSocket funcionando
- [ ] Stripe payments funcionando
- [ ] Logs sem erros críticos
- [ ] Health checks passando

---

## 🆘 Suporte e Recursos

### Documentação Railway
- [Railway Docs](https://docs.railway.app/)
- [Railway Discord](https://discord.gg/railway)
- [Railway Status](https://status.railway.app/)

### Documentação do Projeto
- `README.md` - Visão geral do projeto
- `CLAUDE.md` - Guia para desenvolvimento
- `prisma/schema.prisma` - Schema do banco de dados

### Contato
- GitHub Issues: Reportar bugs
- E-mail: suporte@jhaguar.com (se aplicável)

---

## 🔐 Segurança - Boas Práticas

### Variáveis Sensíveis
- ✅ Nunca commitar `.env` no Git
- ✅ Usar Railway Variables para secrets
- ✅ Rotacionar JWT_SECRET periodicamente
- ✅ Usar chaves de produção separadas

### Backups
- Railway Pro oferece backups automáticos do PostgreSQL
- Considere backup adicional para dados críticos

### Monitoramento de Segurança
- Ativar logs de acesso
- Monitorar tentativas de login falhas
- Implementar rate limiting (já configurado no NestJS)

---

## ✨ Próximos Passos

Após deploy bem-sucedido:

1. ✅ Testar todas as funcionalidades via app mobile
2. ✅ Configurar monitoramento de erros (Sentry)
3. ✅ Configurar analytics (opcional)
4. ✅ Documentar endpoints no Swagger
5. ✅ Criar seed data para produção (usuários de teste)
6. ✅ Configurar backups automáticos
7. ✅ Implementar sistema de notificações push

---

**🐆 Jhaguar Backend está pronto para produção! 🚀**

*Última atualização: 2025-11-12*
