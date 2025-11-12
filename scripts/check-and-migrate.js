#!/usr/bin/env node

/**
 * Script de Verificação e Aplicação de Migrations
 *
 * Este script verifica se o banco de dados está acessível e aplica
 * as migrations do Prisma de forma segura.
 *
 * Uso:
 *   node scripts/check-and-migrate.js
 *
 * Variáveis de ambiente necessárias:
 *   DATABASE_URL - URL de conexão com PostgreSQL
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Cores para output
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

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkDatabaseConnection(retries = 10, delay = 5000) {
  log('\n🔍 Verificando conexão com o banco de dados...', 'cyan');

  for (let i = 1; i <= retries; i++) {
    try {
      log(`   Tentativa ${i}/${retries}...`, 'blue');

      const { stdout, stderr } = await execAsync('npx prisma db execute --stdin <<< "SELECT 1;"', {
        env: process.env,
        timeout: 10000,
      });

      log('✅ Conexão com banco de dados estabelecida!', 'green');
      return true;
    } catch (error) {
      log(`❌ Tentativa ${i} falhou: ${error.message}`, 'yellow');

      if (i < retries) {
        log(`   Aguardando ${delay/1000}s antes da próxima tentativa...`, 'yellow');
        await sleep(delay);
      }
    }
  }

  log('\n❌ ERRO: Não foi possível conectar ao banco de dados após todas as tentativas', 'red');
  return false;
}

async function checkMigrationsStatus() {
  log('\n📋 Verificando status das migrations...', 'cyan');

  try {
    const { stdout } = await execAsync('npx prisma migrate status', {
      env: process.env,
    });

    log(stdout, 'blue');

    // Verificar se há migrations pendentes
    if (stdout.includes('following migration have not yet been applied') ||
        stdout.includes('Database schema is not in sync')) {
      log('⚠️  Migrations pendentes detectadas', 'yellow');
      return 'pending';
    } else if (stdout.includes('No pending migrations')) {
      log('✅ Todas as migrations já foram aplicadas', 'green');
      return 'synced';
    } else if (stdout.includes('schema is not ready') || stdout.includes('does not exist')) {
      log('⚠️  Banco de dados vazio ou schema não criado', 'yellow');
      return 'empty';
    }

    return 'unknown';
  } catch (error) {
    log(`❌ Erro ao verificar status: ${error.message}`, 'red');
    log('   Assumindo que migrations são necessárias...', 'yellow');
    return 'error';
  }
}

async function applyMigrations() {
  log('\n🚀 Aplicando migrations do Prisma...', 'cyan');

  try {
    const { stdout, stderr } = await execAsync('npx prisma migrate deploy', {
      env: process.env,
      timeout: 120000, // 2 minutos
    });

    log(stdout, 'blue');
    if (stderr) log(stderr, 'yellow');

    log('✅ Migrations aplicadas com sucesso!', 'green');
    return true;
  } catch (error) {
    log(`❌ Erro ao aplicar migrations: ${error.message}`, 'red');

    if (error.stdout) log(`stdout: ${error.stdout}`, 'yellow');
    if (error.stderr) log(`stderr: ${error.stderr}`, 'red');

    return false;
  }
}

async function generatePrismaClient() {
  log('\n⚙️  Gerando Prisma Client...', 'cyan');

  try {
    const { stdout } = await execAsync('npx prisma generate', {
      env: process.env,
    });

    log(stdout, 'blue');
    log('✅ Prisma Client gerado com sucesso!', 'green');
    return true;
  } catch (error) {
    log(`❌ Erro ao gerar Prisma Client: ${error.message}`, 'red');
    return false;
  }
}

async function verifyTablesExist() {
  log('\n🔍 Verificando se as tabelas foram criadas...', 'cyan');

  try {
    // Query para verificar se a tabela User existe
    const query = `SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'User'
    );`;

    const { stdout } = await execAsync(`npx prisma db execute --stdin <<< "${query}"`, {
      env: process.env,
    });

    if (stdout.includes('t') || stdout.includes('true')) {
      log('✅ Tabela "User" encontrada no banco de dados!', 'green');
      return true;
    } else {
      log('❌ Tabela "User" não foi encontrada', 'red');
      return false;
    }
  } catch (error) {
    log(`⚠️  Não foi possível verificar tabelas: ${error.message}`, 'yellow');
    return null;
  }
}

async function main() {
  log('\n╔════════════════════════════════════════════════════════╗', 'magenta');
  log('║   🔧 JHAGUAR BACKEND - MIGRATION CHECK & DEPLOY 🔧    ║', 'magenta');
  log('╚════════════════════════════════════════════════════════╝', 'magenta');

  // Verificar variável de ambiente
  if (!process.env.DATABASE_URL) {
    log('\n❌ ERRO: Variável DATABASE_URL não está definida!', 'red');
    log('   Configure a variável de ambiente antes de executar este script.', 'yellow');
    process.exit(1);
  }

  log(`\n📍 DATABASE_URL configurada: ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`, 'blue');

  // Passo 1: Verificar conexão com banco
  const connected = await checkDatabaseConnection();
  if (!connected) {
    log('\n💥 Falha crítica: Banco de dados inacessível', 'red');
    process.exit(1);
  }

  // Passo 2: Verificar status das migrations
  const status = await checkMigrationsStatus();

  // Passo 3: Aplicar migrations se necessário
  if (status === 'pending' || status === 'empty' || status === 'error') {
    const migrated = await applyMigrations();

    if (!migrated) {
      log('\n💥 Falha ao aplicar migrations', 'red');
      process.exit(1);
    }
  }

  // Passo 4: Gerar Prisma Client
  const generated = await generatePrismaClient();
  if (!generated) {
    log('\n⚠️  Aviso: Falha ao gerar Prisma Client', 'yellow');
  }

  // Passo 5: Verificar se tabelas existem
  await verifyTablesExist();

  log('\n╔════════════════════════════════════════════════════════╗', 'green');
  log('║              ✅ PROCESSO CONCLUÍDO COM SUCESSO! ✅      ║', 'green');
  log('╚════════════════════════════════════════════════════════╝', 'green');
  log('\n🚀 O backend está pronto para iniciar!\n', 'cyan');
}

// Executar script
main().catch(error => {
  log(`\n💥 Erro fatal não tratado: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
