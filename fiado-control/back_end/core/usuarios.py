"""RF08: gestão de usuários e perfis de acesso restrita a administradores."""

import re

from django.contrib.auth.hashers import make_password
from django.db import IntegrityError, connection, transaction
from django.views.decorators.csrf import csrf_exempt

from .configuracoes import auditar
from .credito import _acesso
from .financeiro import identificador
from .views import _erro, _json, _json_invalido, _ler_json

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PERFIS_MAP = {
    "ADMIN": "ADMIN",
    "GERENTE": "ADMIN",
    "COMUM": "COMUM",
    "FUNCIONARIO": "COMUM",
}


def _normalizar_perfil(valor):
    if not isinstance(valor, str):
        return None
    return PERFIS_MAP.get(valor.strip().upper())


def _serializar_usuario(linha):
    id_usuario, nome, email, perfil, ativo = linha
    return {
        "id_usuario": id_usuario,
        "nome": nome,
        "email": email,
        "perfil": perfil,
        "ativo": bool(ativo),
    }


@csrf_exempt
def usuarios(request):
    usuario_logado, erro = _acesso(request, escrita=True)
    if erro is not None:
        return erro

    if request.method == "GET":
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT u.id_usuario, u.nome, u.email, p.nome, u.ativo
                FROM usuario u
                JOIN perfil p ON p.id = u.id_perfil
                ORDER BY u.id_usuario
                """
            )
            lista = [_serializar_usuario(row) for row in cursor.fetchall()]
        return _json({"usuarios": lista}, status=200)

    if request.method != "POST":
        return _erro("metodo_nao_permitido", "Método não permitido nesta rota", 405)

    dados = _ler_json(request)
    if dados is None:
        return _json_invalido()

    nome = dados.get("nome")
    email = dados.get("email")
    senha = dados.get("senha")
    perfil_norm = _normalizar_perfil(dados.get("perfil", "COMUM"))
    ativo = dados.get("ativo", True)

    if not isinstance(nome, str) or not 2 <= len(nome.strip()) <= 100:
        return _erro("campo_invalido", "Nome deve conter entre 2 e 100 caracteres", 400, campos=["nome"])
    if not isinstance(email, str) or not EMAIL_RE.match(email.strip()):
        return _erro("campo_invalido", "Informe um e-mail válido", 400, campos=["email"])
    if not isinstance(senha, str) or len(senha) < 6:
        return _erro("campo_invalido", "A senha deve conter no mínimo 6 caracteres", 400, campos=["senha"])
    if perfil_norm is None:
        return _erro("campo_invalido", "Perfil deve ser ADMIN ou COMUM", 400, campos=["perfil"])
    if not isinstance(ativo, bool):
        return _erro("campo_invalido", "Campo ativo deve ser booleano", 400, campos=["ativo"])

    nome_limpo = nome.strip()
    email_limpo = email.strip().lower()
    senha_hash = make_password(senha)

    try:
        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute("SELECT id FROM perfil WHERE nome = %s", [perfil_norm])
            perfil_row = cursor.fetchone()
            if perfil_row is None:
                return _erro("perfil_nao_encontrado", "Perfil de acesso não encontrado", 400)
            id_perfil = perfil_row[0]

            cursor.execute(
                """
                INSERT INTO usuario (nome, email, senha_hash, id_perfil, ativo)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id_usuario
                """,
                [nome_limpo, email_limpo, senha_hash, id_perfil, ativo],
            )
            novo_id = cursor.fetchone()[0]
            criado = {
                "id_usuario": novo_id,
                "nome": nome_limpo,
                "email": email_limpo,
                "perfil": perfil_norm,
                "ativo": ativo,
            }
            auditar(
                cursor,
                usuario_logado,
                "criacao_usuario",
                novo_id,
                {},
                criado,
                f"Cadastro de usuário {email_limpo}",
            )
    except IntegrityError:
        return _erro("email_duplicado", "Já existe um usuário cadastrado com este e-mail", 409, campos=["email"])

    return _json(criado, status=201)


@csrf_exempt
def usuario_detalhe(request, id_usuario):
    usuario_logado, erro = _acesso(request, escrita=True)
    if erro is not None:
        return erro

    id_usuario = identificador(id_usuario)
    if id_usuario is None:
        return _erro("campo_invalido", "Identificador de usuário inválido", 400)

    if request.method == "GET":
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT u.id_usuario, u.nome, u.email, p.nome, u.ativo
                FROM usuario u
                JOIN perfil p ON p.id = u.id_perfil
                WHERE u.id_usuario = %s
                """,
                [id_usuario],
            )
            row = cursor.fetchone()
        if row is None:
            return _erro("usuario_nao_encontrado", "Usuário não encontrado", 404)
        return _json(_serializar_usuario(row), status=200)

    if request.method != "PUT":
        return _erro("metodo_nao_permitido", "Método não permitido nesta rota", 405)

    dados = _ler_json(request)
    if dados is None:
        return _json_invalido()

    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT u.id_usuario, u.nome, u.email, p.nome, u.ativo, u.id_perfil
            FROM usuario u
            JOIN perfil p ON p.id = u.id_perfil
            WHERE u.id_usuario = %s
            FOR UPDATE OF u
            """,
            [id_usuario],
        )
        atual = cursor.fetchone()
        if atual is None:
            return _erro("usuario_nao_encontrado", "Usuário não encontrado", 404)

        _, nome_atual, email_atual, perfil_atual, ativo_atual, id_perfil_atual = atual
        anteriores = _serializar_usuario((id_usuario, nome_atual, email_atual, perfil_atual, ativo_atual))

        novo_nome = nome_atual
        if "nome" in dados and dados["nome"] is not None:
            if not isinstance(dados["nome"], str) or not 2 <= len(dados["nome"].strip()) <= 100:
                return _erro("campo_invalido", "Nome deve conter entre 2 e 100 caracteres", 400, campos=["nome"])
            novo_nome = dados["nome"].strip()

        novo_email = email_atual
        if "email" in dados and dados["email"] is not None:
            if not isinstance(dados["email"], str) or not EMAIL_RE.match(dados["email"].strip()):
                return _erro("campo_invalido", "Informe um e-mail válido", 400, campos=["email"])
            novo_email = dados["email"].strip().lower()

        novo_perfil = perfil_atual
        novo_id_perfil = id_perfil_atual
        if "perfil" in dados and dados["perfil"] is not None:
            perfil_norm = _normalizar_perfil(dados["perfil"])
            if perfil_norm is None:
                return _erro("campo_invalido", "Perfil deve ser ADMIN ou COMUM", 400, campos=["perfil"])
            cursor.execute("SELECT id FROM perfil WHERE nome = %s", [perfil_norm])
            row_p = cursor.fetchone()
            if row_p is None:
                return _erro("perfil_nao_encontrado", "Perfil de acesso não encontrado", 400)
            novo_perfil = perfil_norm
            novo_id_perfil = row_p[0]

        novo_ativo = bool(ativo_atual)
        if "ativo" in dados and dados["ativo"] is not None:
            if not isinstance(dados["ativo"], bool):
                return _erro("campo_invalido", "Campo ativo deve ser booleano", 400, campos=["ativo"])
            novo_ativo = dados["ativo"]

        if id_usuario == usuario_logado and (not novo_ativo or novo_perfil != "ADMIN"):
            return _erro(
                "auto_bloqueio_nao_permitido",
                "Não é permitido desativar ou remover o perfil ADMIN da própria conta",
                422,
            )

        nova_senha_hash = None
        if "senha" in dados and dados["senha"] not in (None, ""):
            if not isinstance(dados["senha"], str) or len(dados["senha"]) < 6:
                return _erro("campo_invalido", "A senha deve conter no mínimo 6 caracteres", 400, campos=["senha"])
            nova_senha_hash = make_password(dados["senha"])

        try:
            if nova_senha_hash is not None:
                cursor.execute(
                    """
                    UPDATE usuario
                    SET nome = %s, email = %s, id_perfil = %s, ativo = %s, senha_hash = %s
                    WHERE id_usuario = %s
                    """,
                    [novo_nome, novo_email, novo_id_perfil, novo_ativo, nova_senha_hash, id_usuario],
                )
            else:
                cursor.execute(
                    """
                    UPDATE usuario
                    SET nome = %s, email = %s, id_perfil = %s, ativo = %s
                    WHERE id_usuario = %s
                    """,
                    [novo_nome, novo_email, novo_id_perfil, novo_ativo, id_usuario],
                )
        except IntegrityError:
            return _erro("email_duplicado", "Já existe um usuário cadastrado com este e-mail", 409, campos=["email"])

        atualizado = {
            "id_usuario": id_usuario,
            "nome": novo_nome,
            "email": novo_email,
            "perfil": novo_perfil,
            "ativo": novo_ativo,
        }
        auditar(
            cursor,
            usuario_logado,
            "edicao_usuario",
            id_usuario,
            anteriores,
            atualizado,
            f"Atualização de usuário {novo_email}",
        )

    return _json(atualizado, status=200)