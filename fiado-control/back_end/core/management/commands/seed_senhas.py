
import os

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction


class Command(BaseCommand):
    help = "Configura as senhas dos usuarios de teste"

    def handle(self, *args, **options):
        senha = os.environ.get("SEED_TEST_PASSWORD")

        if not senha:
            raise CommandError(
                "Defina a variavel SEED_TEST_PASSWORD."
            )

        emails = [
            "funcionario@loja.com",
            "gerente@loja.com",
            "ana@loja.com",
        ]

        with transaction.atomic():
            with connection.cursor() as cursor:
                for email in emails:
                    cursor.execute(
                        """
                        UPDATE usuario
                        SET senha_hash = %s
                        WHERE email = %s
                        """,
                        [make_password(senha), email],
                    )

                    if cursor.rowcount != 1:
                        raise CommandError(
                            f"Usuario nao encontrado ou duplicado: {email}"
                        )

                    self.stdout.write(
                        self.style.SUCCESS(
                            f"Senha configurada: {email}"
                        )
                    )

        self.stdout.write(
            self.style.SUCCESS(
                "Senhas de teste configuradas com sucesso!"
            )
        )
