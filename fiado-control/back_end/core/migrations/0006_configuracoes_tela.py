from django.db import migrations


SCHEMA_SQL = """
ALTER TABLE configuracao ALTER COLUMN taxa_juros TYPE DECIMAL(7,6);
ALTER TABLE configuracao ALTER COLUMN taxa_multa TYPE DECIMAL(7,6);
ALTER TABLE configuracao ADD COLUMN IF NOT EXISTS modo_cobranca VARCHAR(30) NOT NULL DEFAULT 'unica';
ALTER TABLE configuracao ADD COLUMN IF NOT EXISTS preferencias JSONB NOT NULL DEFAULT '{}';
"""


class Migration(migrations.Migration):
    dependencies = [('core', '0005_catalogo_descontos')]
    operations = [migrations.RunSQL(SCHEMA_SQL, migrations.RunSQL.noop)]
