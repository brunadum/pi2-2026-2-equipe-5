// Executa o cliente HTTP real contra um servidor local; nenhuma conta real é usada.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function cliente(t, token) {
  const servidor = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (!req.headers.authorization) {
      res.writeHead(401);
      res.end(JSON.stringify({ erro: 'nao_autenticado', mensagem: 'Autenticação necessária' }));
    } else {
      res.end(JSON.stringify({ authorization: req.headers.authorization }));
    }
  });
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { servidor.closeAllConnections(); servidor.close(resolve); }));
  const window = { FC_CONFIG: { API_BASE_URL: `http://127.0.0.1:${servidor.address().port}` } };
  const contexto = { window, fetch, sessionStorage: { getItem: (chave) => chave === 'token' ? token : null } };
  const codigo = fs.readFileSync(path.join(__dirname, '../fiado-control/front_end/js/services/api.js'), 'utf8');
  vm.runInNewContext(codigo, contexto);
  return window.FC.api;
}

test('requisição encaminha o token do login para uma rota protegida', async (t) => {
  const api = await cliente(t, 'token-de-teste');
  const resposta = await api.request('/configuracoes/');
  assert.equal(resposta.authorization, 'Bearer token-de-teste');
});

test('sem sessão preserva o 401 e não inventa credencial', async (t) => {
  const api = await cliente(t, null);
  await assert.rejects(api.request('/dashboard'), (erro) => {
    assert.equal(erro.status, 401);
    assert.equal(erro.codigo, 'nao_autenticado');
    return true;
  });
});
