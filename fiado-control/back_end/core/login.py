import json

from django.contrib.auth.hashers import check_password
from django.db import connection
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

def _senha_confere(senha, senha_hash):
    # Aceita senha criptografada (Django) e, nos dados de teste, senha em texto simples.
    if senha_hash.startswith(("pbkdf2_", "argon2", "bcrypt", "md5$", "sha1$")):
        return check_password(senha, senha_hash)
    return senha == senha_hash


@csrf_exempt
@require_POST
def login(request):
    try:
        dados = json.loads(request.body)

        email = dados.get("email", "").strip()
        senha = dados.get("senha", "")

        if not email or not senha:
            return JsonResponse(
                {"erro": "Informe o e-mail e a senha"},
                status=400
            )

        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT u.id_usuario, u.nome, u.email, u.senha_hash, p.nome, u.ativo
                FROM usuario u
                LEFT JOIN perfil p ON p.id = u.id_perfil
                WHERE u.email = %s
                """,
                [email]
            )
            usuario = cursor.fetchone()

        if usuario is None:
            return JsonResponse(
                {"erro": "E-mail ou senha inválidos"},
                status=401
            )

        id_usuario, nome, email_db, senha_hash, perfil, ativo = usuario

        if not ativo or not _senha_confere(senha, senha_hash):
            return JsonResponse(
                {"erro": "E-mail ou senha inválidos"},
                status=401
            )

        return JsonResponse({
            "mensagem": "Login realizado com sucesso",
            "usuario": {
                "id_usuario": id_usuario,
                "nome": nome,
                "email": email_db,
                "perfil": perfil
            }
        })

    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse(
            {"erro": "JSON inválido"},
            status=400
        )
