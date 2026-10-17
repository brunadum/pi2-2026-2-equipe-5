import json

from django.db import connection
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

@csrf_exempt
@require_POST

def login(request):
    try:
        dados=json.loads(request.body)
        email=dados.get("email","").strip()
        senha=dados.get("senha","")
        if not email or not senha:
            return JsonResponse(
                {"erro":"Informe o e-mail e a senha"},
                status=400
            )

        with connection.cursor() as cursor:
            cursor.execute(
                """SELECT id_usuario,nome,email,senha_hash,perfil,ativo
                from usuario WHERE email=%s""",
                [email]
            )
            usuario=cursor.fetchone()
            if usuario is None:
                return JsonResponse(
                    {"erro": "Email ou senha inválido"},
                    status=401
                )
            id_usuario, nome, email_db, senha_hash, perfil, ativo = usuario

            if not ativo or senha!=senha_hash:
                return JsonResponse(
                    {"erro":"E-mail ou senha inválida"},
                    status=401
                )
            return JsonResponse({
                "mensagem":"Login realizado com sucesso",
                "usuario":{
                    "id_usuario": id_usuario,
                    "nome":nome,
                    "email": email_db,
                    "perfil":perfil
                }
            })
        
    except(json.JSONDecodeError,UnicodeDecodeError):
        return JsonResponse(
            {"erro":"JSON inválido"},
            status=400
        )
