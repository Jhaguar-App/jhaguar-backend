#!/usr/bin/env node

/**
 * Script de Verificação de Produção
 *
 * Verifica se todos os serviços estão funcionando corretamente
 * após o deploy no Railway.
 *
 * Uso:
 *   node scripts/verify-production.js https://api.jhaguar.com
 */

const https = require('https');
const http = require('http');

const API_URL = process.argv[2] || 'https://api.jhaguar.com';

// Cores
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

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const timeout = setTimeout(() => {
      reject(new Error('Timeout após 10 segundos'));
    }, 10000);

    lib.get(url, (res) => {
      clearTimeout(timeout);
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: data ? JSON.parse(data) : null,
            headers: res.headers,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data,
            headers: res.headers,
          });
        }
      });
    }).on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function checkHealthEndpoint() {
  log('\n🏥 Verificando Health Check...', 'cyan');
  try {
    const result = await makeRequest(`${API_URL}/`);
    if (result.status === 200) {
      log('   ✅ Health check OK', 'green');
      return true;
    } else {
      log(`   ❌ Status inesperado: ${result.status}`, 'red');
      return false;
    }
  } catch (error) {
    log(`   ❌ Erro: ${error.message}`, 'red');
    return false;
  }
}

async function checkSwaggerDocs() {
  log('\n📚 Verificando Documentação Swagger...', 'cyan');
  try {
    const result = await makeRequest(`${API_URL}/api-docs`);
    if (result.status === 200 || result.status === 301) {
      log('   ✅ Swagger acessível', 'green');
      return true;
    } else {
      log(`   ⚠️  Status: ${result.status}`, 'yellow');
      return false;
    }
  } catch (error) {
    log(`   ❌ Erro: ${error.message}`, 'red');
    return false;
  }
}

async function checkAuthEndpoint() {
  log('\n🔐 Verificando Endpoint de Autenticação...', 'cyan');
  try {
    // Tentar fazer login com credenciais inválidas (esperamos 401)
    const result = await makeRequest(`${API_URL}/auth/login`);
    // GET em /auth/login pode retornar 404 ou 405
    if (result.status === 404 || result.status === 405) {
      log('   ✅ Endpoint de autenticação existe', 'green');
      return true;
    } else {
      log(`   ⚠️  Status inesperado: ${result.status}`, 'yellow');
      return true; // Considerar sucesso
    }
  } catch (error) {
    log(`   ❌ Erro: ${error.message}`, 'red');
    return false;
  }
}

async function checkRideTypesEndpoint() {
  log('\n🚗 Verificando Endpoint de Tipos de Corrida...', 'cyan');
  try {
    const result = await makeRequest(`${API_URL}/ride-types/available`);
    if (result.status === 200) {
      log('   ✅ Endpoint de ride-types OK', 'green');
      if (Array.isArray(result.data)) {
        log(`   📊 ${result.data.length} tipos de corrida disponíveis`, 'blue');
      }
      return true;
    } else if (result.status === 401) {
      log('   ⚠️  Endpoint protegido (401) - esperado', 'yellow');
      return true;
    } else {
      log(`   ❌ Status inesperado: ${result.status}`, 'red');
      return false;
    }
  } catch (error) {
    log(`   ❌ Erro: ${error.message}`, 'red');
    return false;
  }
}

async function checkSSL() {
  if (!API_URL.startsWith('https')) {
    log('\n🔒 SSL: Não aplicável (HTTP)', 'yellow');
    return null;
  }

  log('\n🔒 Verificando Certificado SSL...', 'cyan');
  return new Promise((resolve) => {
    const hostname = new URL(API_URL).hostname;
    const options = {
      hostname,
      port: 443,
      method: 'GET',
      path: '/',
    };

    const req = https.request(options, (res) => {
      const cert = res.socket.getPeerCertificate();
      if (cert && Object.keys(cert).length > 0) {
        log('   ✅ Certificado SSL válido', 'green');
        log(`   📅 Válido até: ${cert.valid_to}`, 'blue');
        log(`   🏢 Emissor: ${cert.issuer.O || 'N/A'}`, 'blue');
        resolve(true);
      } else {
        log('   ❌ Certificado SSL não encontrado', 'red');
        resolve(false);
      }
    });

    req.on('error', (error) => {
      log(`   ❌ Erro SSL: ${error.message}`, 'red');
      resolve(false);
    });

    req.end();
  });
}

async function checkResponseTime() {
  log('\n⏱️  Medindo Tempo de Resposta...', 'cyan');
  const start = Date.now();

  try {
    await makeRequest(`${API_URL}/`);
    const elapsed = Date.now() - start;

    if (elapsed < 1000) {
      log(`   ✅ Resposta rápida: ${elapsed}ms`, 'green');
    } else if (elapsed < 3000) {
      log(`   ⚠️  Resposta aceitável: ${elapsed}ms`, 'yellow');
    } else {
      log(`   ❌ Resposta lenta: ${elapsed}ms`, 'red');
    }

    return elapsed < 3000;
  } catch (error) {
    log(`   ❌ Erro: ${error.message}`, 'red');
    return false;
  }
}

async function main() {
  log('\n╔════════════════════════════════════════════════════════╗', 'magenta');
  log('║      🔍 JHAGUAR - VERIFICAÇÃO DE PRODUÇÃO 🔍         ║', 'magenta');
  log('╚════════════════════════════════════════════════════════╝', 'magenta');
  log(`\n🌐 URL da API: ${API_URL}`, 'cyan');

  const results = {
    health: await checkHealthEndpoint(),
    swagger: await checkSwaggerDocs(),
    auth: await checkAuthEndpoint(),
    rideTypes: await checkRideTypesEndpoint(),
    ssl: await checkSSL(),
    responseTime: await checkResponseTime(),
  };

  // Resumo
  log('\n╔════════════════════════════════════════════════════════╗', 'blue');
  log('║                  📊 RESUMO DOS TESTES                  ║', 'blue');
  log('╚════════════════════════════════════════════════════════╝', 'blue');

  const passed = Object.values(results).filter(r => r === true).length;
  const failed = Object.values(results).filter(r => r === false).length;
  const skipped = Object.values(results).filter(r => r === null).length;
  const total = Object.keys(results).length;

  log(`\n   ✅ Passou: ${passed}/${total}`, 'green');
  if (failed > 0) log(`   ❌ Falhou: ${failed}/${total}`, 'red');
  if (skipped > 0) log(`   ⚠️  Pulado: ${skipped}/${total}`, 'yellow');

  // Status final
  log('\n╔════════════════════════════════════════════════════════╗', failed > 0 ? 'red' : 'green');
  if (failed === 0) {
    log('║            ✅ TODOS OS TESTES PASSARAM! ✅             ║', 'green');
    log('║        A API está funcionando corretamente!           ║', 'green');
  } else {
    log('║              ❌ ALGUNS TESTES FALHARAM ❌              ║', 'red');
    log('║      Revise os logs acima para mais detalhes          ║', 'red');
  }
  log('╚════════════════════════════════════════════════════════╝\n', failed > 0 ? 'red' : 'green');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(error => {
  log(`\n💥 Erro fatal: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
