from django.db import migrations


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS produto (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    preco_venda DECIMAL(10,2) NOT NULL,
    quantidade_estoque INTEGER DEFAULT 0,
    ativo BOOLEAN DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS desconto_parcela (
    id_desconto BIGSERIAL PRIMARY KEY,
    id_pagamento INTEGER NOT NULL REFERENCES pagamento(id_pagamento),
    valor_desconto DECIMAL(10,2) NOT NULL CHECK (valor_desconto > 0),
    valor_juros DECIMAL(10,2) NOT NULL DEFAULT 0,
    valor_multa DECIMAL(10,2) NOT NULL DEFAULT 0,
    data_desconto DATE NOT NULL DEFAULT CURRENT_DATE,
    id_usuario INTEGER NOT NULL REFERENCES usuario(id_usuario),
    motivo VARCHAR(200) NOT NULL
);
CREATE INDEX IF NOT EXISTS desconto_parcela_idx ON desconto_parcela(id_pagamento);
"""


class Migration(migrations.Migration):
    dependencies = [('core', '0004_auditoria_financeira')]
    operations = [migrations.RunSQL(SCHEMA_SQL, migrations.RunSQL.noop)]
