
import jwt

from django.conf import settings
from .models import Usuario


class JWTAuthenticationMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.usuario = None

        authorization = request.headers.get("Authorization", "")
        partes = authorization.split()

        if len(partes) == 2 and partes[0].lower() == "bearer":
            token = partes[1]

            try:
                payload = jwt.decode(
                    token,
                    settings.SECRET_KEY,
                    algorithms=["HS256"]
                )

                id_usuario = payload.get("id_usuario")

                if type(id_usuario) is int:
                    request.usuario = Usuario.objects.select_related('perfil_acesso').filter(
                        pk=id_usuario,
                        ativo=True
                    ).first()

            except jwt.InvalidTokenError:
                pass

        return self.get_response(request)
