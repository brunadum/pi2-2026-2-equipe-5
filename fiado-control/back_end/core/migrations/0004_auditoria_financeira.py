from django.db import migrations


AUDITORIA_SQL = """
CREATE TABLE IF NOT EXISTS auditoria_financeira (
    id_auditoria BIGSERIAL PRIMARY KEY,
    id_usuario INTEGER NOT NULL REFERENCES usuario(id_usuario),
    operacao VARCHAR(40) NOT NULL,
    id_recurso INTEGER NOT NULL,
    data_hora TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valores_anteriores JSONB NOT NULL,
    valores_novos JSONB NOT NULL,
    motivo VARCHAR(200) NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS recebimento_data_idx ON recebimento(data_pagamento);
ALTER TABLE recebimento ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(30);
"""


class Migration(migrations.Migration):
    dependencies = [('core', '0003_integrar_perfis_usuario')]
    operations = [migrations.RunSQL(AUDITORIA_SQL, migrations.RunSQL.noop)]
