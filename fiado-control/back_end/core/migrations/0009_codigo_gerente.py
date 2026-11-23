from django.db import migrations


# Linha única (id = 1). Guarda apenas o hash do código, nunca o código.
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS codigo_gerente (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    codigo_hash VARCHAR(255) NOT NULL,
    definido_por INTEGER NOT NULL REFERENCES usuario(id_usuario),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tentativas_falhas INTEGER NOT NULL DEFAULT 0,
    bloqueado_ate TIMESTAMPTZ
);
"""


class Migration(migrations.Migration):
    dependencies = [('core', '0008_initial')]
    operations = [migrations.RunSQL(SCHEMA_SQL, migrations.RunSQL.noop)]
