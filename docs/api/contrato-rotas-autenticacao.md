# Contrato das Rotas de Autenticação — Fiado Control

> Issue: `[BACK] Docs: documentar contrato das rotas de autenticação #9`

## POST /api/auth/login

**Request**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response 200**
```json
{
  "token": "string",
  "usuario_id": 1,
  "perfil": "gerente | funcionario"
}
```

**Response 401**
```json
{
  "detail": "Credenciais inválidas"
}
```

## GET /api/auth/me

**Headers**
```
Authorization: Bearer <token>
```

**Response 200**
```json
{
  "id": 1,
  "nome": "string",
  "perfil": "gerente | funcionario"
}
```

**Response 401**
```json
{
  "detail": "Token inválido ou expirado"
}
```

## POST /api/auth/logout

**Headers**
```
Authorization: Bearer <token>
```

**Response 204**
Sem corpo.

## Critérios de aceitação

- [ ] Contrato de `POST /api/auth/login` documentado (request e responses de sucesso/erro)
- [ ] Contrato de `GET /api/auth/me` documentado (request e responses de sucesso/erro)
- [ ] Contrato de `POST /api/auth/logout` documentado
- [ ] Arquivo `docs/api/contrato-rotas-autenticacao.md` commitado
