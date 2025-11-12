# 🔧 Scripts Utilitários - Jhaguar Backend

Coleção de scripts para gerenciamento, manutenção e verificação do backend.

## 📋 Scripts Disponíveis

### 🔄 check-and-migrate.js

Script robusto para verificar e aplicar migrations do Prisma.

**Uso:**
```bash
node scripts/check-and-migrate.js
```

**O que faz:**
- ✅ Verifica conexão com PostgreSQL (10 tentativas com retry)
- ✅ Verifica status das migrations
- ✅ Aplica migrations pendentes automaticamente
- ✅ Gera Prisma Client
- ✅ Verifica se tabelas foram criadas
- ✅ Logs detalhados e coloridos

**Quando usar:**
- Deploy em produção (executado automaticamente via Dockerfile)
- Após pull de novas migrations
- Troubleshooting de problemas de banco de dados
- Setup inicial do projeto

**Variáveis necessárias:**
- `DATABASE_URL` - URL de conexão PostgreSQL

---

### 🔍 verify-production.js

Script para verificar saúde da API em produção.

**Uso:**
```bash
# Verificar produção
node scripts/verify-production.js https://api.jhaguar.com

# Verificar local
node scripts/verify-production.js http://localhost:3000
```

**O que verifica:**
- 🏥 Health check endpoint
- 📚 Documentação Swagger
- 🔐 Endpoints de autenticação
- 🚗 Endpoints de ride-types
- 🔒 Certificado SSL (se HTTPS)
- ⏱️ Tempo de resposta

**Exit codes:**
- `0` - Todos os testes passaram
- `1` - Um ou mais testes falharam

**Quando usar:**
- Após deploy em produção
- Monitoramento manual
- CI/CD pipeline
- Troubleshooting

---

## 🚀 Scripts Existentes (Legado)

### check-drivers.js
Verifica drivers cadastrados no banco.

### check-users.js
Verifica usuários cadastrados no banco.

### check-complete-db.js
Verifica todo o estado do banco de dados.

### cleanup-active-rides.js
Limpa corridas ativas que ficaram travadas.

### cleanup-completed-rides.js
Limpa corridas completadas antigas.

### api-cleanup-script.js
Script geral de limpeza via API.

---

## 📦 Dependências

Todos os scripts usam apenas dependências nativas do Node.js:
- `child_process` - Execução de comandos
- `util` - Promisify
- `http/https` - Requests HTTP

Não requerem instalação adicional de pacotes.

---

## 🔐 Segurança

**⚠️ IMPORTANTE:**

- Scripts acessam DATABASE_URL diretamente
- Nunca commitar `.env` com credenciais
- Em produção, usar variáveis de ambiente do Railway
- Scripts de limpeza devem ser usados com cuidado

---

## 🛠️ Desenvolvimento

### Adicionar novo script

1. Criar arquivo em `scripts/`
2. Adicionar shebang: `#!/usr/bin/env node`
3. Tornar executável: `chmod +x scripts/seu-script.js`
4. Documentar neste README
5. Adicionar logs coloridos para melhor UX

### Padrão de logs

```javascript
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}
```

---

## 📞 Suporte

Para problemas ou dúvidas:
- Abrir issue no GitHub
- Consultar `RAILWAY_DEPLOY_GUIDE.md`
- Verificar logs do Railway

---

**Última atualização:** 2025-11-12
