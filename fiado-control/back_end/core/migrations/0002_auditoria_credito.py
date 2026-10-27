from django.db import migrations


AUDITORIA_SQL = """
CREATE TABLE IF NOT EXISTS auditoria_credito (
    id_auditoria BIGSERIAL PRIMARY KEY,
    id_cliente INTEGER NOT NULL REFERENCES cliente(id_cliente),
    id_usuario INTEGER NOT NULL REFERENCES usuario(id_usuario),
    data_hora TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    operacao VARCHAR(30) NOT NULL CHECK (operacao IN ('alteracao_limite', 'bloqueio_credito')),
    valores_anteriores JSONB NOT NULL,
    valores_novos JSONB NOT NULL,
    motivo VARCHAR(200) NOT NULL DEFAULT ''
);
"""


class Migration(migrations.Migration):
    dependencies = [('core', '0001_initial')]
    operations = [migrations.RunSQL(AUDITORIA_SQL, 'DROP TABLE auditoria_credito;')]
