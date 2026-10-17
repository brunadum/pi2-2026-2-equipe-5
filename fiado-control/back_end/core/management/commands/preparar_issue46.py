from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction


class Command(BaseCommand):
    help = 'Adequa o banco existente às rotas da issue #46, preservando os dados. Pode ser repetido.'

    @transaction.atomic
    def handle(self, *args, **options):
        tabelas = set(connection.introspection.table_names())
        if not {'cliente', 'pagamento', 'usuario', 'venda', 'configuracao'} <= tabelas:
            raise CommandError('Aplique primeiro o schema base do projeto (init-scripts/01-schema.sql).')
        with connection.cursor() as cursor:
            cursor.execute('ALTER TABLE cliente ADD COLUMN IF NOT EXISTS credito_bloqueado BOOLEAN NOT NULL DEFAULT FALSE')
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS recebimento (
                    id_recebimento SERIAL PRIMARY KEY,
                    id_pagamento INT NOT NULL REFERENCES pagamento(id_pagamento) ON DELETE CASCADE,
                    valor_recebido DECIMAL(10,2) NOT NULL,
                    data_pagamento DATE NOT NULL DEFAULT CURRENT_DATE,
                    id_usuario INT REFERENCES usuario(id_usuario)
                )
            """)
            cursor.execute('ALTER TABLE recebimento ADD COLUMN IF NOT EXISTS valor_juros DECIMAL(10,2) NOT NULL DEFAULT 0')
            cursor.execute('ALTER TABLE recebimento ADD COLUMN IF NOT EXISTS valor_multa DECIMAL(10,2) NOT NULL DEFAULT 0')
            cursor.execute('CREATE INDEX IF NOT EXISTS recebimento_parcela_idx ON recebimento (id_pagamento)')
            cursor.execute('CREATE INDEX IF NOT EXISTS venda_cliente_idx ON venda (id_cliente)')
            cursor.execute('CREATE INDEX IF NOT EXISTS pagamento_venda_idx ON pagamento (id_venda)')
        self.stdout.write(self.style.SUCCESS('Banco preparado para a issue #46. Dados existentes preservados.'))
