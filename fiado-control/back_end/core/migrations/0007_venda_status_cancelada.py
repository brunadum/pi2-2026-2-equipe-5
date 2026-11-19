from django.db import migrations


SQL = """
ALTER TABLE venda DROP CONSTRAINT IF EXISTS venda_status_check;
ALTER TABLE venda ADD CONSTRAINT venda_status_check
    CHECK (status IN ('aprovada', 'rejeitada', 'pendente_autorizacao', 'cancelada'));
"""


class Migration(migrations.Migration):
    dependencies = [('core', '0006_configuracoes_tela')]
    operations = [migrations.RunSQL(SQL, migrations.RunSQL.noop)]